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

// Ensure environment variables are loaded from a .env file
dotenv.config();

// ------------------------
// Configuration & Initialization
// ------------------------
const app = express();
const PORT = process.env.PORT || 5000;
// FIX: Explicitly set the host to 0.0.0.0 for Fly.io compatibility
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
app.use(express.static(path.join(__dirname, 'public')));
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

const generatePdfContent = (doc, client) => {
  const data = client.toObject(); // Use toObject() for a plain JS object
  doc.fontSize(20).text("Client Submission Form", { align: "center" });
  doc.moveDown();
  doc.fontSize(14).text(`Full Name: ${data.fullName || "N/A"}`);
  doc.text(`Title: ${data.title || "N/A"}`);
  doc.text(`Company: ${data.company || "N/A"}`);
  doc.moveDown();
  doc.text(`Phone 1: ${data.phone1 || "N/A"}`);
  if (data.phone2) doc.text(`Phone 2: ${data.phone2}`);
  if (data.phone3) doc.text(`Phone 3: ${data.phone3}`);
  doc.moveDown();
  doc.text(`Email 1: ${data.email1 || "N/A"}`);
  if (data.email2) doc.text(`Email 2: ${data.email2}`);
  if (data.email3) doc.text(`Email 3: ${data.email3}`);
  doc.moveDown();
  doc.text(`Bio: ${data.bio || "N/A"}`);
  doc.text(`Address: ${data.address || "N/A"}`);
  doc.text(`Business Website: ${data.businessWebsite || "N/A"}`);
  doc.text(`Portfolio Website: ${data.portfolioWebsite || "N/A"}`);
  if (data.socialLinks && typeof data.socialLinks === "object") {
    doc.moveDown();
    doc.text("Social Links:");
    for (const [key, value] of Object.entries(data.socialLinks)) {
      if (value) doc.text(`         - ${key}: ${value}`);
    }
  }
  if (data.workingHours && typeof data.workingHours === "object") {
    doc.moveDown();
    doc.text("Working Hours:");
    for (const [key, value] of Object.entries(data.workingHours)) {
      if (value) doc.text(`         - ${key}: ${value}`);
    }
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
  const vcardUrl = client.vcardUrl;
  const mailOptions = {
    from: `SmartCardLink <${SMTP_USER}>`,
    to: client.email1,
    cc: SMTP_USER,
    subject: `Your SmartCardLink vCard is ready!`,
    html: `
        <p>Hello ${client.fullName},</p>
        <p>Thank you for using SmartCardLink! Your digital business card is now ready.</p>
        <p>You can access your vCard here: <a href="${vcardUrl}">${vcardUrl}</a></p>
        <p>You can also use the QR code provided by the admin to share your contact details easily.</p>
        <p>Best regards,<br>The SmartCardLink Team</p>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${client.email1} and ${SMTP_USER}`);
    await logAction(SMTP_USER, "system", "EMAIL_SENT", client._id, null, { recipient: client.email1 });
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending email to ${client.email1}:`, error);
    await logAction(SMTP_USER, "system", "EMAIL_FAILED", client._id, error.message, { recipient: client.email1 });
    return { success: false, error: error.message };
  }
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
      activeMonths: "N/A" // This would require additional logic to calculate
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
        // Log the action (optional, for debugging)
        console.log("✅ Photo uploaded successfully:", req.file.path);
        // Return the secure URL from Cloudinary
        res.status(200).json({ success: true, message: "Photo uploaded successfully.", photoUrl: req.file.path });
    } catch (error) {
        console.error("❌ Error uploading photo:", error);
        res.status(500).json({ success: false, message: "Server error uploading photo." });
    }
});


// Upload Photo (PREVIEW ONLY): POST /api/clients/:id/photo (protected)
// This route is now redundant with the new /api/upload-photo route and has been deprecated.
// app.post("/api/clients/:id/photo", authMiddleware, adminAuth, parser.single("photo"), async (req, res) => {
//   if (!req.file || !req.file.path) {
//     return res.status(400).json({ success: false, message: "Upload failed: no file provided or path found" });
//   }
//   await logAction(req.user.email, req.user.isAdmin ? "admin" : "staff", "PHOTO_UPLOADED", req.params.id, null, { tempPhotoUrl: req.file.path });
//   res.status(200).json({ success: true, message: "Photo uploaded for preview.", photoUrl: req.file.path });
// });

// Save/Update Info: PUT /api/clients/:id (protected)
app.put("/api/clients/:id", authMiddleware, adminAuth, async (req, res) => {
  try {
    const { photoUrl, ...adminData } = req.body;
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found." });
    }

    // Update fields directly on the client object
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

    const finalVcardUrl = `${APP_BASE_URL}/${client.slug}`;
    const fallbackVcardUrl = `${APP_FALLBACK_URL}/vcard/${client._id}`;
    const qrCodeUrl = await QRCode.toDataURL(fallbackVcardUrl);

    client.vcardUrl = finalVcardUrl;
    client.qrCodeUrl = qrCodeUrl;
    client.status = "Active";
    client.history.push({
      action: "VCARD_CREATED",
      notes: "vCard and QR code generated.",
      actorEmail: req.user.email
    });
    await client.save();

    await logAction(req.user.email, "admin", "VCARD_CREATED", client._id, "vCard generated and status set to Active.");
    const emailStatus = await sendVCardEmail(client);

    if (emailStatus.success) {
      res.status(200).json({
        success: true,
        message: "vCard created and email sent successfully.",
        vcardUrl: finalVcardUrl,
        qrCodeUrl: qrCodeUrl
      });
    } else {
      res.status(200).json({
        success: true,
        message: "vCard created successfully. WARNING: Email failed to send.",
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

// View Client PDF: GET /api/clients/:id/pdf (protected)
app.get("/api/clients/:id/pdf", authMiddleware, adminAuth, async (req, res) => {
  const release = await pdfSemaphore.acquire();
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found." });

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=client-${client.slug}-submission.pdf`);
    doc.pipe(res);
    generatePdfContent(doc, client);
    doc.end();

    await logAction(req.user.email, "admin", "PDF_VIEWED", client._id);
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
    res.status(500).json({ success: false, message: "Server error generating PDF." });
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

// Public vCard Access (fallback route): GET /vcard/:id
app.get("/vcard/:id", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client || client.status !== "Active") {
      return res.status(404).send("vCard not found or not active.");
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${client.fullName} - SmartCardLink</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #f0f2f5; color: #333; }
            .vcard-container { max-width: 600px; margin: 40px auto; padding: 30px; background-color: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
            .vcard-photo { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin-bottom: 25px; border: 4px solid #f0f2f5; }
            h1 { font-size: 2em; margin: 0; color: #1a1a1a; }
            h2 { font-size: 1.2em; color: #555; font-weight: 400; margin-top: 5px; }
            .details { margin-top: 20px; text-align: left; }
            .details p { margin: 10px 0; font-size: 1.1em; color: #444; }
            .details strong { color: #1a1a1a; }
            .icon { vertical-align: middle; margin-right: 10px; }
            .footer-links { margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
            .footer-links a { text-decoration: none; color: #007bff; margin: 0 15px; font-weight: 600; }
            .footer-links a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="vcard-container">
            ${client.photoUrl ? `<img src="${client.photoUrl}" alt="Profile Photo" class="vcard-photo">` : ''}
            <h1>${client.fullName}</h1>
            <h2>${client.title} at ${client.company}</h2>
            <div class="details">
              <p><img src="https://img.icons8.com/material-outlined/24/000000/phone.png" alt="Phone Icon" class="icon"><strong>Phone:</strong> ${client.phone1}</p>
              <p><img src="https://img.icons8.com/material-outlined/24/000000/email.png" alt="Email Icon" class="icon"><strong>Email:</strong> ${client.email1}</p>
              ${client.bio ? `<p><img src="https://img.icons8.com/material-outlined/24/000000/about.png" alt="Bio Icon" class="icon"><strong>Bio:</strong> ${client.bio}</p>` : ''}
              ${client.businessWebsite ? `<p><img src="https://img.icons8.com/material-outlined/24/000000/website.png" alt="Website Icon" class="icon"><strong>Website:</strong> <a href="${client.businessWebsite}">${client.businessWebsite}</a></p>` : ''}
              ${client.address ? `<p><img src="https://img.icons8.com/material-outlined/24/000000/address.png" alt="Address Icon" class="icon"><strong>Address:</strong> ${client.address}</p>` : ''}
            </div>
            <div class="footer-links">
              <a href="#">Save to Contacts</a>
              <a href="#">Share</a>
            </div>
          </div>
        </body>
        </html>
    `;
    res.status(200).send(htmlContent);
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
    const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH); // Using same hash for both
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