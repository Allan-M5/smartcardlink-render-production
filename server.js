// ------------------------
// Imports
// ------------------------
const express = require("express");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const RateLimit = require("express-rate-limit");
const { Semaphore } = require("await-semaphore");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const { Parser } = require("json2csv");
const slugify = require("slugify");
const vCardsJS = require("vcards-js");
const fetch = require('node-fetch');
const puppeteer = require("puppeteer");
const { PassThrough } = require('stream');

// Ensure environment variables are loaded from a .env file
dotenv.config();

// ------------------------
// Configuration & Initialization
// ------------------------
const app = express();
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
const MONGO_URI = process.env.MONGODB_URI;
const APP_BASE_URL = process.env.APP_BASE_URL;
const APP_FALLBACK_URL = process.env.APP_FALLBACK_URL;

// Email Config
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Cloudinary config - Corrected to use individual variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Required environment variables check - Updated to remove auth
const requiredEnv = [
    "MONGODB_URI", "APP_BASE_URL", "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "SMTP_HOST", "SMTP_PORT",
    "SMTP_USER", "SMTP_PASS", "ADMIN_EMAIL"
];
for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`❌ Missing required environment variable: ${key}. Aborting.`);
        process.exit(1);
    }
}

// ------------------------
// Rate limiters & PDF semaphore
// ------------------------
const pdfSemaphore = new Semaphore(1);
const publicLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again later.",
});

// ------------------------
// Middleware
// ------------------------
app.use(helmet({
    crossOriginEmbedderPolicy: false,
}));
app.use(morgan("combined"));

const allowedOrigins = [
    'https://smartcardlink.perfectparcelsstore.com',
    'https://endearing-banoffee-27fd44.netlify.app',
    'https://allan-m5.github.io',
    'http://localhost:5000'
];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some(url => origin.startsWith(url))) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname)));

// ------------------------
// Public-facing Routes
// ------------------------
// Root URL
app.get('/', (req, res) => {
    res.send('SmartCardLink App is running.');
});

// Admin Form URL
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-form.html'));
});

// ------------------------
// MongoDB Connection
// ------------------------
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB connected successfully");
    } catch (err) {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    }
};
connectDB();

// ------------------------
// Mongoose Schema & Model
// ------------------------
const logSchema = new mongoose.Schema({
    actorEmail: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    targetClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    notes: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model("Log", logSchema);

const clientSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    phone1: { type: String, required: true, trim: true },
    phone2: { type: String, trim: true },
    phone3: { type: String, trim: true },
    email1: { type: String, required: true, lowercase: true, trim: true, match: [/^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/, "Invalid email format"] },
    email2: { type: String, lowercase: true, trim: true, match: [/^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/, "Invalid email format"] },
    email3: { type: String, lowercase: true, trim: true, match: [/^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/, "Invalid email format"] },
    company: { type: String, required: true, trim: true },
    businessWebsite: { type: String, trim: true },
    portfolioWebsite: { type: String, trim: true },
    locationMap: { type: String, trim: true },
    bio: { type: String, trim: true },
    address: { type: String, trim: true },
    socialLinks: { type: Object, default: {} },
    workingHours: { type: Object, default: {} },
    photoUrl: { type: String, default: "" },
    pdfUrl: { type: String, default: "" },
    slug: { type: String, required: true, unique: true },
    vcardUrl: { type: String, default: "" },
    qrCodeUrl: { type: String, default: "" },
    status: { type: String, enum: ["Pending", "Processed", "Active", "Disabled", "Deleted"], default: "Pending" },
    history: [{
        action: { type: String, required: true },
        notes: { type: String },
        actorEmail: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
});

clientSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const Client = mongoose.model("Client", clientSchema);

// ------------------------
// Helpers
// ------------------------
const logAction = async (actorEmail, actorRole, action, targetClientId, notes = null, payload = null) => {
    try {
        await Log.create({ actorEmail, actorRole, action, targetClientId, notes, payload });
    } catch (error) {
        console.error(`❌ Failed to log action '${action}' for client ${targetClientId}:`, error);
    }
};

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

const sendVCardEmail = async (client) => {
    const mailOptions = {
        from: `SmartCardLink <${SMTP_USER}>`,
        to: client.email1,
        cc: ADMIN_EMAIL,
        subject: `Your SmartCardLink vCard is ready!`,
        html: `
            <p>Hello ${client.fullName},</p>
            <p>Thank you for using SmartCardLink! Your digital business card is now ready.</p>
            <p>You can access your vCard here: <a href="${client.vcardUrl}">${client.vcardUrl}</a></p>
            <p>You can also use the QR code provided by the admin to share your contact details easily.</p>
            <p>Best regards,<br>The SmartCardLink Team</p>
        `,
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${client.email1} and ${ADMIN_EMAIL}`);
        await logAction(ADMIN_EMAIL, "system", "EMAIL_SENT", client._id, null, { recipient: client.email1, cc: ADMIN_EMAIL });
        return { success: true };
    } catch (error) {
        console.error(`❌ Error sending email to ${client.email1}:`, error);
        await logAction(ADMIN_EMAIL, "system", "EMAIL_FAILED", client._id, error.message, { recipient: client.email1 });
        return { success: false, error: error.message };
    }
};

const generateVcard = async (client) => {
    const vcard = vCardsJS();
    vcard.firstName = client.fullName.split(" ")[0] || "";
    vcard.lastName = client.fullName.split(" ").slice(1).join(" ") || "";
    vcard.organization = client.company || "";
    vcard.title = client.title || "";

    // Fix: Correctly assign phone numbers as an array
    const phones = [client.phone1];
    if (client.phone2) phones.push(client.phone2);
    if (client.phone3) phones.push(client.phone3);
    vcard.workPhone = phones.length > 0 ? phones : ["N/A"];

    // Fix: Correctly assign emails as an array
    const emails = [client.email1];
    if (client.email2) emails.push(client.email2);
    if (client.email3) emails.push(client.email3);
    vcard.workEmail = emails.length > 0 ? emails : ["N/A"];

    vcard.url = client.businessWebsite || "";
    vcard.note = client.bio || "";
    vcard.address = client.address || "";

    if (client.photoUrl) {
        try {
            const response = await fetch(client.photoUrl);
            const photoBuffer = await response.buffer();
            vcard.photo.embedFromString(photoBuffer.toString('base64'), "image/jpeg");
        } catch (err) {
            console.error("❌ Failed to embed photo in vCard:", err);
        }
    }

    return vcard.getFormattedString();
};

const uploadToCloudinary = (fileBuffer, slug, resourceType, folderName) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            folder: folderName,
            public_id: slug,
            resource_type: resourceType,
        }, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        stream.end(fileBuffer);
    });
};

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "smartcardlink_photos",
        allowed_formats: ["jpg", "jpeg", "png"],
        transformation: [{ width: 800, height: 800, crop: "limit" }],
    },
});
const parser = multer({ storage });

// Unified PDF generation function
// This function now handles PDF generation and Cloudinary upload,
// eliminating code duplication and fixing the bug.
const generateAndUploadPdf = async (clientData) => {
    let browser;
    try {
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                    .container { max-width: 600px; margin: auto; border: 1px solid #ccc; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    .photo-container { text-align: center; margin-bottom: 20px; }
                    .photo { width: 150px; height: 150px; border-radius: 50%; object-fit: cover; }
                    h1, h2, h3 { color: #0056b3; text-align: center; margin: 0; }
                    h1 { font-size: 2em; }
                    h2 { font-size: 1.5em; color: #555; }
                    h3 { font-size: 1.2em; color: #777; }
                    .info-section { margin-top: 20px; }
                    .info-section p { margin: 5px 0; line-height: 1.6; }
                    .label { font-weight: bold; color: #333; }
                    .social-links { margin-top: 15px; }
                    .social-links h4 { margin-bottom: 5px; color: #0056b3; }
                    .social-links ul { list-style-type: none; padding: 0; }
                    .social-links li { margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="photo-container">
                        <img src="${clientData.photoUrl || ''}" class="photo" alt="Client Photo" />
                    </div>
                    <h1>${clientData.fullName}</h1>
                    <h2>${clientData.company}</h2>
                    <h3>${clientData.title}</h3>
                    <div class="info-section">
                        <p><span class="label">Bio:</span> ${clientData.bio || 'N/A'}</p>
                        <p><span class="label">Address:</span> ${clientData.address || 'N/A'}</p>
                        <p><span class="label">Phone 1:</span> ${clientData.phone1 || 'N/A'}</p>
                        <p><span class="label">Email 1:</span> ${clientData.email1 || 'N/A'}</p>
                        <p><span class="label">Business Website:</span> <a href="${clientData.businessWebsite || '#'}">${clientData.businessWebsite || 'N/A'}</a></p>
                        <p><span class="label">Portfolio Website:</span> <a href="${clientData.portfolioWebsite || '#'}">${clientData.portfolioWebsite || 'N/A'}</a></p>
                    </div>
                    ${clientData.socialLinks && Object.keys(clientData.socialLinks).length > 0 ? `
                        <div class="social-links">
                            <h4>Social Links:</h4>
                            <ul>
                                ${Object.entries(clientData.socialLinks).map(([key, value]) => `<li>${key}: <a href="${value}">${value}</a></li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </body>
            </html>
        `;
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
        });

        const uploadResult = await uploadToCloudinary(pdfBuffer, `client_info_${clientData.slug}`, "raw", "smartcardlink_client_pdfs");
        return uploadResult.secure_url;
    } catch (err) {
        console.error("❌ Error generating or uploading PDF:", err);
        throw err;
    } finally {
        if (browser) await browser.close();
    }
};

// ------------------------
// Routes
// ------------------------
// Client Submission: POST /api/clients
app.post("/api/clients", publicLimiter, async (req, res) => {
    const release = await pdfSemaphore.acquire();
    try {
        const { fullName } = req.body;
        let baseSlug = slugify(fullName, { lower: true, strict: true });
        let slug = baseSlug;
        let counter = 1;

        while (await Client.findOne({ 'slug': slug })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        const clientDataForPdf = { ...req.body, fullName, slug };
        const pdfUrl = await generateAndUploadPdf(clientDataForPdf);

        const client = new Client({
            ...req.body,
            slug,
            pdfUrl,
            status: "Pending"
        });
        await client.save();

        await logAction("public", "public", "CLIENT_CREATED", client._id, "New client submitted via public form.");
        res.status(201).json({ success: true, message: "Client form saved", recordId: client._id });
    } catch (err) {
        console.error("❌ Error saving client form:", err);
        if (err.name === "ValidationError") return res.status(400).json({ success: false, message: err.message });
        res.status(500).json({ success: false, message: "Server error" });
    } finally {
        release();
    }
});

// GET all clients for the public dashboard (no authentication required)
app.get("/api/clients/all", async (req, res) => {
    try {
        const clients = await Client.find({}, 'fullName company email1 phone1 status createdAt photoUrl');
        const formattedClients = clients.map(client => ({
            ...client.toObject(),
            vcardCreatedDate: client.createdAt.toISOString().split('T')[0],
            activeMonths: "N/A"
        }));
        res.status(200).json(formattedClients);
    } catch (error) {
        console.error("❌ Error fetching clients for public dashboard:", error);
        res.status(500).json({ success: false, message: "Server error fetching clients." });
    }
});

// Admin Dashboard: GET /api/clients
app.get("/api/clients", async (req, res) => {
    try {
        const allClients = await Client.find({});
        res.status(200).json(allClients);
    } catch (error) {
        console.error("❌ Error fetching all clients:", error);
        res.status(500).json({ success: false, message: "Server error fetching clients." });
    }
});

// Admin Form: GET /api/clients/:id
app.get("/api/clients/:id", async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) {
            return res.status(404).json({ success: false, message: "Client not found." });
        }
        res.status(200).json(client);
    } catch (error) {
        console.error("❌ Error fetching client data:", error);
        res.status(500).json({ success: false, message: "Server error fetching client data." });
    }
});

// New Photo Upload Route: POST /api/upload-photo (for general use)
app.post("/api/upload-photo", parser.single("photo"), async (req, res) => {
    try {
        if (!req.file || !req.file.path) {
            return res.status(400).json({ success: false, message: "Upload failed: no file provided or path found." });
        }
        console.log("✅ Photo uploaded successfully:", req.file.path);
        res.status(200).json({ success: true, message: "Photo uploaded successfully.", photoUrl: req.file.path });
    } catch (error) {
        console.error("❌ Error uploading photo:", error);
        res.status(500).json({ success: false, message: "Server error uploading photo." });
    }
});

// Save/Update Info: PUT /api/clients/:id
app.put("/api/clients/:id", async (req, res) => {
    try {
        const { photoUrl, ...adminData } = req.body;
        const client = await Client.findById(req.params.id);
        if (!client) {
            return res.status(404).json({ success: false, message: "Client not found." });
        }
        Object.assign(client, adminData);
        client.photoUrl = photoUrl;
        client.status = "Processed";
        client.history.push({
            action: "CLIENT_UPDATED / SAVE_INFO",
            notes: "Admin confirmed and saved client data.",
            actorEmail: "admin"
        });
        await client.save();
        await logAction("admin", "admin", "CLIENT_UPDATED / SAVE_INFO", client._id, "Admin saved confirmed data.");

        res.status(200).json({ success: true, message: "Client info saved successfully.", client });
    } catch (error) {
        console.error("❌ Error saving client info:", error);
        if (error.name === "ValidationError") return res.status(400).json({ success: false, message: error.message });
        res.status(500).json({ success: false, message: "Server error saving client info." });
    }
});

// Create vCard: POST /api/clients/:id/vcard
app.post("/api/clients/:id/vcard", async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ success: false, message: "Client not found." });

        const vcfContent = await generateVcard(client);
        const vcfBuffer = Buffer.from(vcfContent, 'utf-8');

        let vcardCloudinaryUrl;
        let qrCodeUrl;
        try {
            const uploadResult = await uploadToCloudinary(vcfBuffer, client.slug, "raw", "smartcardlink_vcards");
            vcardCloudinaryUrl = uploadResult.secure_url;

            const qrCodeData = await QRCode.toDataURL(vcardCloudinaryUrl);
            qrCodeUrl = qrCodeData;
        } catch (uploadError) {
            console.error("❌ Error uploading vCard:", uploadError);
            return res.status(500).json({ success: false, message: "Server error uploading vCard file." });
        }

        client.vcardUrl = vcardCloudinaryUrl;
        client.qrCodeUrl = qrCodeUrl;
        client.status = "Active";
        client.history.push({
            action: "VCARD_CREATED",
            notes: "vCard and QR code generated and saved to Cloudinary.",
            actorEmail: "admin"
        });
        await client.save();

        await logAction("admin", "admin", "VCARD_CREATED", client._id, "vCard generated and status set to Active.");

        const emailStatus = await sendVCardEmail(client);

        res.status(200).json({
            success: true,
            message: "vCard created, saved, and email sent successfully.",
            vcardUrl: vcardCloudinaryUrl,
            qrCodeUrl: qrCodeUrl,
            emailStatus: emailStatus.success ? "success" : "failed"
        });
    } catch (error) {
        console.error("❌ Error creating vCard:", error);
        res.status(500).json({ success: false, message: "Server error creating vCard." });
    }
});

// View Client PDF: GET /api/clients/:id/pdf
// Fix: Added fallback generation logic
app.get("/api/clients/:id/pdf", async (req, res) => {
    const release = await pdfSemaphore.acquire();
    try {
        const client = await Client.findById(req.params.id);
        if (!client) {
            return res.status(404).json({ success: false, message: "Client not found." });
        }

        // If a PDF URL exists, redirect to it
        if (client.pdfUrl) {
            return res.redirect(302, client.pdfUrl);
        }

        // Fallback: If no PDF URL exists, generate and upload it now
        console.log("PDF not found, generating a new one...");
        const newPdfUrl = await generateAndUploadPdf(client);
        
        // Update the client record with the new URL
        client.pdfUrl = newPdfUrl;
        client.history.push({
            action: "PDF_GENERATED_ON_DEMAND",
            notes: "PDF was generated and uploaded upon a view request.",
            actorEmail: "admin"
        });
        await client.save();
        await logAction("admin", "admin", "PDF_GENERATED_ON_DEMAND", client._id, "PDF generated on demand.");

        // Redirect to the newly created PDF
        res.redirect(302, newPdfUrl);

    } catch (error) {
        console.error("❌ Error retrieving or generating PDF:", error);
        res.status(500).json({ success: false, message: "Server error retrieving or generating PDF." });
    } finally {
        release();
    }
});


// Status change routes (Disable/Reactivate/Delete)
app.put("/api/clients/:id/status/:newStatus", async (req, res) => {
    const { newStatus } = req.params;
    const { notes } = req.body;
    const validStatuses = ["Active", "Disabled", "Deleted"];
    if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ success: false, message: "Invalid status provided." });
    }
    if (!notes || notes.length < 5) {
        return res.status(400).json({ success: false, message: "Notes are required and must be at least 5 characters long." });
    }

    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ success: false, message: "Client not found." });

        client.status = newStatus;
        client.history.push({
            action: `STATUS_CHANGED to ${newStatus}`,
            notes,
            actorEmail: "admin"
        });
        await client.save();
        await logAction("admin", "admin", "STATUS_CHANGED", client._id, notes, { newStatus });

        res.status(200).json({ success: true, message: `Client status updated to ${newStatus}.`, client });
    } catch (error) {
        console.error("❌ Error updating client status:", error);
        res.status(500).json({ success: false, message: "Server error updating status." });
    }
});

// Excel Export: GET /api/clients/export
app.get("/api/clients/export", async (req, res) => {
    try {
        const clients = await Client.find({});
        const fields = [
            "_id",
            "fullName",
            "title",
            "company",
            "email1",
            "phone1",
            "vcardUrl",
            "status",
            "createdAt",
            "updatedAt"
        ];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(clients);
        res.header('Content-Type', 'text/csv');
        res.attachment('smartcardlink_clients_export.csv');
        res.send(csv);
        await logAction("admin", "admin", "DATA_EXPORTED", null, "Client data exported to Excel.");
    } catch (error) {
        console.error("❌ Error exporting client data:", error);
        res.status(500).json({ success: false, message: "Server error exporting data." });
    }
});

// Log Viewer: GET /api/logs
app.get("/api/logs", async (req, res) => {
    try {
        const logs = await Log.find({}).sort({ timestamp: -1 });
        res.status(200).json(logs);
    } catch (error) {
        console.error("❌ Error fetching logs:", error);
        res.status(500).json({ success: false, message: "Server error fetching logs." });
    }
});

// Public vCard Access (direct URL): GET /vcard/:id
app.get("/vcard/:id", async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client || client.status !== "Active") {
            return res.status(404).send("vCard not found or not active.");
        }

        if (client.vcardUrl) {
            res.redirect(302, client.vcardUrl);
        } else {
            res.status(404).send("vCard file not found.");
        }
    } catch (error) {
        console.error("❌ Error accessing public vCard:", error);
        res.status(500).send("Error accessing vCard.");
    }
});

// Start server
app.listen(PORT, HOST, () => {
    console.log(`🚀 SmartCardLink App running at http://${HOST}:${PORT}`);
});

module.exports = app;