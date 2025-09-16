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
const PDFDocument = require("pdfkit");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
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

// Ensure environment variables are loaded from a .env file
dotenv.config();

// ------------------------
// Configuration & Initialization
// ------------------------
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";
const MONGO_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL;
const APP_FALLBACK_URL = process.env.APP_FALLBACK_URL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

// Email Config
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Required environment variables check
const requiredEnv = [
    "MONGODB_URI", "JWT_SECRET", "ADMIN_PASSWORD_HASH",
    "APP_BASE_URL", "APP_FALLBACK_URL", "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "SMTP_HOST", "SMTP_PORT",
    "SMTP_USER", "SMTP_PASS"
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
const loginLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many login attempts from this IP, please try again after 15 minutes.",
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
    'https://smartcardlink-flyio-fallback.fly.dev',
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
// 🟢 CHANGE: Serve static files from the root directory instead of a 'public' folder
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.send('Hello, world!');
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

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token provided." });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { audience: "smartcardlink", issuer: "smartcardlink-app" });
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
        if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") return res.status(401).json({ success: false, message: "Invalid token." });
        return res.status(500).json({ success: false, message: "Authentication error." });
    }
};

const adminAuth = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ success: false, message: "Forbidden: Admin access required." });
    }
};

const staffAuth = (req, res, next) => {
    if (req.user && !req.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ success: false, message: "Forbidden: Staff access required." });
    }
};

const pdfDir = path.join(__dirname, "vcards");
if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

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
        cc: SMTP_USER,
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
        console.log(`✅ Email sent to ${client.email1} and ${SMTP_USER}`);
        await logAction(SMTP_USER, "system", "EMAIL_SENT", client._id, null, { recipient: client.email1, cc: SMTP_USER });
        return { success: true };
    } catch (error) {
        console.error(`❌ Error sending email to ${client.email1}:`, error);
        await logAction(SMTP_USER, "system", "EMAIL_FAILED", client._id, error.message, { recipient: client.email1 });
        return { success: false, error: error.message };
    }
};

const generateVcard = async (client) => {
    const vcard = vCardsJS();
    vcard.firstName = client.fullName.split(" ")[0] || "";
    vcard.lastName = client.fullName.split(" ").slice(1).join(" ") || "";
    vcard.organization = client.company || "";
    vcard.title = client.title || "";
    vcard.workPhone = client.phone1 || "";
    if (client.phone2) vcard.workPhone = [vcard.workPhone, client.phone2];
    if (client.phone3) vcard.workPhone = [vcard.workPhone, client.phone3];
    vcard.workEmail = client.email1 || "";
    if (client.email2) vcard.workEmail = [vcard.workEmail, client.email2];
    if (client.email3) vcard.workEmail = [vcard.workEmail, client.email3];
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

const uploadVcardToCloudinary = (filePath, slug) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(filePath, {
            folder: "smartcardlink_vcards",
            public_id: slug,
            resource_type: "raw"
        }, (error, result) => {
            if (error) {
                return reject(error);
            }
            resolve(result);
        });
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

// ------------------------
// Routes
// ------------------------
// Client Submission: POST /api/clients
app.post("/api/clients", publicLimiter, async (req, res) => {
    try {
        const { fullName } = req.body;
        let baseSlug = slugify(fullName, { lower: true, strict: true });
        let slug = baseSlug;
        let counter = 1;

        while (await Client.findOne({ 'slug': slug })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        const client = new Client({
            ...req.body,
            slug,
            status: "Pending"
        });
        await client.save();
        await logAction("public", "public", "CLIENT_CREATED", client._id, "New client submitted via public form.");
        res.status(201).json({ success: true, message: "Client form saved", recordId: client._id });
    } catch (err) {
        console.error("❌ Error saving client form:", err);
        if (err.name === "ValidationError") return res.status(400).json({ success: false, message: err.message });
        res.status(500).json({ success: false, message: "Server error" });
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

// Admin Dashboard: GET /api/clients (protected)
app.get("/api/clients", authMiddleware, adminAuth, async (req, res) => {
    try {
        const allClients = await Client.find({});
        res.status(200).json(allClients);
    } catch (error) {
        console.error("❌ Error fetching all clients:", error);
        res.status(500).json({ success: false, message: "Server error fetching clients." });
    }
});

// Admin Form: GET /api/clients/:id (protected)
app.get("/api/clients/:id", authMiddleware, async (req, res) => {
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

// Save/Update Info: PUT /api/clients/:id (protected)
app.put("/api/clients/:id", authMiddleware, adminAuth, async (req, res) => {
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
            actorEmail: req.user.email
        });
        await client.save();
        await logAction(req.user.email, "admin", "CLIENT_UPDATED / SAVE_INFO", client._id, "Admin saved confirmed data.");

        res.status(200).json({ success: true, message: "Client info saved successfully.", client });
    } catch (error) {
        console.error("❌ Error saving client info:", error);
        if (error.name === "ValidationError") return res.status(400).json({ success: false, message: error.message });
        res.status(500).json({ success: false, message: "Server error saving client info." });
    }
});

// Create vCard: POST /api/clients/:id/vcard (protected)
app.post("/api/clients/:id/vcard", authMiddleware, adminAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ success: false, message: "Client not found." });
        if (client.status !== "Processed") return res.status(400).json({ success: false, message: "vCard can only be created for clients with 'Processed' status." });

        const vcfContent = await generateVcard(client);
        const tempFilePath = path.join(__dirname, 'temp', `${client.slug}.vcf`);

        if (!fs.existsSync(path.join(__dirname, 'temp'))) {
            fs.mkdirSync(path.join(__dirname, 'temp'));
        }
        fs.writeFileSync(tempFilePath, vcfContent);

        let vcardCloudinaryUrl;
        try {
            const uploadResult = await uploadVcardToCloudinary(tempFilePath, client.slug);
            vcardCloudinaryUrl = uploadResult.secure_url;
            fs.unlinkSync(tempFilePath);
        } catch (uploadError) {
            console.error("❌ Error uploading vCard to Cloudinary:", uploadError);
            fs.unlinkSync(tempFilePath);
            return res.status(500).json({ success: false, message: "Server error uploading vCard file." });
        }

        const finalVcardUrl = vcardCloudinaryUrl;
        const qrCodeUrl = await QRCode.toDataURL(finalVcardUrl);

        client.vcardUrl = finalVcardUrl;
        client.qrCodeUrl = qrCodeUrl;
        client.status = "Active";
        client.history.push({
            action: "VCARD_CREATED",
            notes: "vCard and QR code generated and saved to Cloudinary.",
            actorEmail: req.user.email
        });
        await client.save();

        await logAction(req.user.email, "admin", "VCARD_CREATED", client._id, "vCard generated and status set to Active.");

        const emailStatus = await sendVCardEmail(client);

        if (emailStatus.success) {
            res.status(200).json({
                success: true,
                message: "vCard created, saved, and email sent successfully.",
                vcardUrl: finalVcardUrl,
                qrCodeUrl: qrCodeUrl
            });
        } else {
            res.status(200).json({
                success: true,
                message: "vCard created and saved successfully. WARNING: Email failed to send.",
                vcardUrl: finalVcardUrl,
                qrCodeUrl: qrCodeUrl,
                emailError: emailStatus.error
            });
        }
    } catch (error) {
        console.error("❌ Error creating vCard:", error);
        res.status(500).json({ success: false, message: "Server error creating vCard." });
    }
});

// 🟢 NEW: Endpoint to generate HTML for the PDF
app.get("/api/client-card-html/:id", authMiddleware, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) {
            return res.status(404).send("Client not found.");
        }

        // Construct the HTML string with client data
        const html = `
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
                        <img src="${client.photoUrl || ''}" class="photo" alt="Client Photo" />
                    </div>
                    <h1>${client.fullName}</h1>
                    <h2>${client.company}</h2>
                    <h3>${client.title}</h3>
                    <div class="info-section">
                        <p><span class="label">Bio:</span> ${client.bio || 'N/A'}</p>
                        <p><span class="label">Address:</span> ${client.address || 'N/A'}</p>
                        <p><span class="label">Phone 1:</span> ${client.phone1 || 'N/A'}</p>
                        <p><span class="label">Email 1:</span> ${client.email1 || 'N/A'}</p>
                        <p><span class="label">Business Website:</span> <a href="${client.businessWebsite || '#'}">${client.businessWebsite || 'N/A'}</a></p>
                        <p><span class="label">Portfolio Website:</span> <a href="${client.portfolioWebsite || '#'}">${client.portfolioWebsite || 'N/A'}</a></p>
                    </div>
                    ${client.socialLinks && Object.keys(client.socialLinks).length > 0 ? `
                        <div class="social-links">
                            <h4>Social Links:</h4>
                            <ul>
                                ${Object.entries(client.socialLinks).map(([key, value]) => `<li>${key}: <a href="${value}">${value}</a></li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (error) {
        console.error("❌ Error generating HTML for PDF:", error);
        res.status(500).send("Server error generating HTML.");
    }
});


// View Client PDF: GET /api/clients/:id/pdf (protected)
app.get("/api/clients/:id/pdf", authMiddleware, adminAuth, async (req, res) => {
    const release = await pdfSemaphore.acquire();
    try {
        const client = await Client.findById(req.params.id);
        if (!client) {
            return res.status(404).send("Client not found.");
        }

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();

        // 🟢 CHANGE: Use the new inline HTML generation route
        const clientCardUrl = `http://localhost:${PORT}/api/client-card-html/${client._id}`;

        await page.goto(clientCardUrl, {
            waitUntil: 'networkidle0',
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '',
            footerTemplate: `<div style="font-size: 10px; margin-left: 20px; text-align: right; width: 100%;"><span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
        });

        await browser.close();

        res.contentType('application/pdf');
        res.send(pdfBuffer);

        await logAction(req.user.email, "admin", "PDF_GENERATED_VIA_PUPPETEER", client._id);

    } catch (error) {
        console.error("❌ Error generating PDF with Puppeteer:", error);
        res.status(500).send("Server error generating PDF.");
    } finally {
        release();
    }
});

// Status change routes (Disable/Reactivate/Delete) (protected)
app.put("/api/clients/:id/status/:newStatus", authMiddleware, adminAuth, async (req, res) => {
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
            actorEmail: req.user.email
        });
        await client.save();
        await logAction(req.user.email, "admin", "STATUS_CHANGED", client._id, notes, { newStatus });

        res.status(200).json({ success: true, message: `Client status updated to ${newStatus}.`, client });
    } catch (error) {
        console.error("❌ Error updating client status:", error);
        res.status(500).json({ success: false, message: "Server error updating status." });
    }
});

// Excel Export: GET /api/clients/export (protected)
app.get("/api/clients/export", authMiddleware, adminAuth, async (req, res) => {
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
        await logAction(req.user.email, "admin", "DATA_EXPORTED", null, "Client data exported to Excel.");
    } catch (error) {
        console.error("❌ Error exporting client data:", error);
        res.status(500).json({ success: false, message: "Server error exporting data." });
    }
});

// Log Viewer: GET /api/logs (protected)
app.get("/api/logs", authMiddleware, adminAuth, async (req, res) => {
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

// Login routes
app.post("/api/admin/login", loginLimiter, async (req, res) => {
    const { password } = req.body;
    try {
        const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        if (!isMatch) {
            await logAction("admin-attempt", "admin", "LOGIN_FAILED", null, "Invalid credentials provided.", { ip: req.ip });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = jwt.sign({ isAdmin: true, email: "admin" }, JWT_SECRET, {
            expiresIn: "1h", audience: "smartcardlink", issuer: "smartcardlink-app",
        });
        const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await logAction("admin", "admin", "LOGIN_SUCCESS", null, null, { ip: req.ip, expiry });
        res.json({ success: true, token, message: "Login successful. Token valid for 1 hour." });
    } catch (err) {
        console.error("❌ Admin login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// New simplified Staff login route
app.post("/api/staff/login", loginLimiter, async (req, res) => {
    const { password } = req.body;
    try {
        const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        if (!isMatch) {
            await logAction("staff-attempt", "staff", "LOGIN_FAILED", null, "Invalid credentials provided.", { ip: req.ip });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = jwt.sign({ isAdmin: false, email: "staff" }, JWT_SECRET, {
            expiresIn: "1h", audience: "smartcardlink", issuer: "smartcardlink-app",
        });
        const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await logAction("staff", "staff", "LOGIN_SUCCESS", null, null, { ip: req.ip, expiry });
        res.json({ success: true, token, message: "Login successful. Token valid for 1 hour." });
    } catch (err) {
        console.error("❌ Staff login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Start server
app.listen(PORT, HOST, () => {
    console.log(`🚀 SmartCardLink App running at http://${HOST}:${PORT}`);
});

module.exports = app;