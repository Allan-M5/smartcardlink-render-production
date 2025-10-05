// SmartCardLink - Final Production-ready server.js
// - Addressing all previous runtime, deployment, security, and performance concerns.
// ------------------------------------------------------------------------------

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
const slugify = require("slugify");
// 1. Puppeteer in Production: Replace puppeteer with puppeteer-core
const puppeteer = require("puppeteer-core");
const fetch = require("node-fetch");
const { Readable } = require("stream");
// 5. Error Logging: Use Pino for structured logging
const pino = require("pino");

// Configuration
dotenv.config();

// ------------------------
// Config & Env & Logging
// ------------------------
const app = express();
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
const MONGO_URI = process.env.MONGODB_URI;
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_BASE || `http://localhost:${PORT}`;
const APP_FALLBACK_URL = process.env.APP_FALLBACK_URL || "";
const BACKEND_API_URL = APP_BASE_URL.startsWith("http") ? new URL(APP_BASE_URL).origin : APP_BASE_URL;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || null;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// 6. Miscellaneous: Review ALLOWED_ORIGINS default - Removed GitHub Pages example
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://smartcardlink.perfectparcelsstore.com").split(",").map(s => s.trim()).filter(Boolean);

// 5. Error Logging: Pino Logger setup
const logger = pino({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport: process.env.NODE_ENV === "production" ? undefined : {
        target: "pino-pretty",
        options: { colorize: true }
    }
});

// Basic required env check
const required = ["MONGODB_URI", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
for (const k of required) {
    if (!process.env[k]) {
        logger.warn(`⚠️ Warning - environment variable ${k} is not set.`);
    }
}

// ------------------------
// Cloudinary config
// ------------------------
cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
});

// ------------------------
// Middleware
// ------------------------
// Use morgan, but pipe output through Pino in production (or keep simple for now)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// 3. CSP & Security: Improved CSP - Removed 'unsafe-inline' from scriptSrc
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            // 3. CSP: Removed 'unsafe-inline'. Added potential third-party analytics/scripts.
            scriptSrc: ["'self'", "*.googletagmanager.com", "*.google-analytics.com"],
            // 3. CSP: Added 'unsafe-hashes' or specific hashes if needed for inline scripts
            // For now, only remove 'unsafe-inline' and trust the frontend build.
            // If you need specific inline scripts, you must use hashes.
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"], // Keeping 'unsafe-inline' for style due to potential runtime styles
            imgSrc: ["'self'", "data:", "res.cloudinary.com"],
            connectSrc: ["'self'", BACKEND_API_URL, "res.cloudinary.com", "https://api.cloudinary.com", APP_FALLBACK_URL, "*.google-analytics.com", "*.analytics.google.com"],
            fontSrc: ["'self'", "res.cloudinary.com", "https://fonts.gstatic.com"],
            frameAncestors: ["'self'"], // Prevents clickjacking via iframe
        },
    })
);

// CORS (restrict to allowed origins)
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.some(a => origin.startsWith(a))) {
                return callback(null, true);
            }
            logger.warn({ origin }, "CORS rejected request from unauthorized origin");
            return callback(new Error("CORS not allowed"), false);
        },
    })
);

// JSON parser with size limit
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

// Static serving setup
const staticPath = path.join(__dirname);
app.use(express.static(staticPath, {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));


// Rate limiter for public endpoints
const publicLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: "Too many requests, please try again later.",
    legacyHeaders: false, // Security: Disable X-RateLimit-* headers
    standardHeaders: true, // Security: Use standard RateLimit headers
});

// Semaphore for concurrent heavy PDF operations (capacity 1)
const pdfSemaphore = new Semaphore(1);
const MAX_PDF_WAIT_MS = 3000; // Client wait time before queue full error

// ------------------------
// Helpers: Standard response wrappers and Logger integration
// ------------------------
const respSuccess = (res, data = null, message = "OK", statusCode = 200, meta = null) => {
    const body = { success: true, data, message };
    if (meta) body.meta = meta;
    return res.status(statusCode).json(body);
};
const respError = (res, message = "Server error", statusCode = 500, data = null, errorObj = null) => {
    logger.error({ statusCode, message, error: errorObj }, "Responding with error");
    return res.status(statusCode).json({ success: false, data, message });
};

// ------------------------
// MongoDB connection & Models (Simplified and using logger)
// ------------------------
mongoose.set("strictQuery", true);

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, { autoIndex: true });
        logger.info("✅ MongoDB connected");
    } catch (err) {
        logger.fatal({ err }, "❌ MongoDB connection failed");
        // In a production environment, you might want to exit the process
        // process.exit(1);
    }
};
connectDB();

// Logs collection schema (blueprint-aligned)
const logSchema = new mongoose.Schema(
    {
        actor: { type: String, required: true },
        action: { type: String, required: true },
        targetClientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
        notes: { type: String, default: null },
        payload: { type: mongoose.Schema.Types.Mixed, default: null },
        timestamp: { type: Date, default: Date.now },
    },
    { versionKey: false }
);
const Log = mongoose.model("Log", logSchema);

// Client schema (blueprint-aligned)
const clientSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true },
        title: { type: String, trim: true, default: "" },
        phone1: { type: String, required: true, trim: true },
        phone2: { type: String, trim: true, default: "" },
        phone3: { type: String, trim: true, default: "" },
        email1: { type: String, required: true, trim: true, lowercase: true },
        email2: { type: String, trim: true, lowercase: true, default: "" },
        email3: { type: String, trim: true, lowercase: true, default: "" },
        company: { type: String, required: true, trim: true },
        businessWebsite: { type: String, trim: true, default: "" },
        portfolioWebsite: { type: String, trim: true, default: "" },
        locationMap: { type: String, trim: true, default: "" },
        bio: { type: String, trim: true, default: "" },
        address: { type: String, trim: true, default: "" },
        socialLinks: {
            facebook: { type: String, default: "" },
            instagram: { type: String, default: "" },
            twitter: { type: String, default: "" },
            linkedin: { type: String, default: "" },
            tiktok: { type: String, default: "" },
            youtube: { type: String, default: "" },
        },
        workingHours: {
            monFriStart: { type: String, default: "" },
            monFriEnd: { type: String, default: "" },
            satStart: { type: String, default: "" },
            satEnd: { type: String, default: "" },
            sunStart: { type: String, default: "" },
            sunEnd: { type: String, default: "" },
        },
        photoUrl: { type: String, default: "" },
        vcardUrl: { type: String, default: "" },
        vcardFileUrl: { type: String, default: "" },
        qrCodeUrl: { type: String, default: "" },
        pdfUrl: { type: String, default: "" },
        slug: { type: String, required: true, unique: true },
        status: {
            type: String,
            enum: ["pending", "processed", "approved", "rejected", "disabled", "deleted"],
            default: "pending",
        },
        history: [
            {
                action: { type: String, required: true },
                notes: { type: String },
                actor: { type: String, required: true, default: "admin" },
                timestamp: { type: Date, default: Date.now },
            },
        ],
        createdAt: { type: Date, default: Date.now, index: true },
        updatedAt: { type: Date, default: Date.now },
    },
    { versionKey: false }
);
clientSchema.pre("save", function (next) {
    this.updatedAt = Date.now();
    next();
});
const Client = mongoose.model("Client", clientSchema);

// ------------------------
// Utility helpers
// ------------------------
const logAction = async (actor = "system", action = "UNKNOWN", targetClientId = null, notes = null, payload = null) => {
    try {
        await Log.create({ actor, action, targetClientId, notes, payload });
    } catch (err) {
        logger.error({ err }, "❌ Failed to write log to DB");
    }
};

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

// send vCard email
const sendVCardEmail = async (client) => {
    if (!client?.email1) {
        await logAction("system", "EMAIL_FAILED", client ? client._id : null, "No client.email1 present", null);
        logger.warn("Attempted to send email but client.email1 was missing.");
        return { success: false, error: "No recipient email" };
    }
    const mailOptions = {
        from: `SmartCardLink <${SMTP_USER}>`,
        to: client.email1,
        cc: ADMIN_EMAIL || undefined,
        subject: `Your SmartCardLink vCard is ready`,
        html: `<p>Hello ${client.fullName || ""},</p>
               <p>Your vCard is ready: <a href="${client.vcardUrl}">${client.vcardUrl}</a></p>
               <p>Thank you — SmartCardLink.</p>`,
    };
    try {
        await transporter.sendMail(mailOptions);
        await logAction("system", "EMAIL_SENT", client._id, null, { recipient: client.email1 });
        logger.info({ recipient: client.email1 }, "vCard email sent successfully.");
        return { success: true };
    } catch (err) {
        logger.error({ err }, "❌ Email send error");
        await logAction("system", "EMAIL_FAILED", client._id, err?.message || String(err), { recipient: client.email1 });
        return { success: false, error: err?.message || String(err) };
    }
};

// Upload buffer/file to Cloudinary using upload_stream
const uploadToCloudinary = (fileBuffer, publicId = null, resourceType = "image", folderName = "smartcardlink") =>
    new Promise((resolve, reject) => {
        try {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: folderName,
                    public_id: publicId,
                    resource_type: resourceType,
                    overwrite: true,
                    format: resourceType === "raw" ? undefined : undefined // Let cloudinary auto-determine format for image/raw
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            const readable = new Readable();
            readable._read = () => { };
            readable.push(fileBuffer);
            readable.push(null);
            readable.pipe(stream);
        } catch (err) {
            reject(err);
        }
    });

// Multer + Cloudinary storage for admin photo uploads
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "smartcardlink_photos",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [{ width: 1200, height: 1200, crop: "limit" }],
    },
});
const upload = multer({ storage });

// Utility: safe slug generator (Improved: 4. Slug Generation - Deterministic suffix)
const generateUniqueSlug = async (baseName) => {
    let baseSlug = slugify(baseName || "user", { lower: true, strict: true });
    if (!baseSlug) baseSlug = `user-${Date.now()}`;
    let slug = baseSlug;
    let counter = 0;
    
    // Check initial slug
    let client = await Client.findOne({ slug }).select('_id');
    
    // Deterministic loop optimization: use UUID/timestamp suffix if a few attempts fail
    while (client && counter < 50) {
        counter++;
        slug = `${baseSlug}-${counter}`;
        client = await Client.findOne({ slug }).select('_id');
    }

    // Fallback for very high collision rate (unlikely with professional client names)
    if (client) {
        slug = `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`;
        logger.warn({ baseSlug, finalSlug: slug }, "High collision detected, using random slug suffix.");
    }
    
    return slug;
};


// Utility: create vCard content
const generateVcardContent = (client) => {
    const esc = (s = "") => {
        return String(s)
            .replace(/\r?\n/g, "\\n")
            .replace(/,/g, "\\,")
            .replace(/;/g, "\\;");
    };

    const lines = [];
    lines.push("BEGIN:VCARD");
    lines.push("VERSION:3.0");
    const names = (client.fullName || "").split(" ");
    const firstName = names.shift() || "";
    const lastName = names.join(" ") || "";
    lines.push(`FN:${esc(client.fullName || "")}`);
    lines.push(`N:${esc(lastName)};${esc(firstName)};;;`);
    if (client.company) lines.push(`ORG:${esc(client.company)}`);
    if (client.title) lines.push(`TITLE:${esc(client.title)}`);
    if (client.phone1) lines.push(`TEL;TYPE=WORK,VOICE:${esc(client.phone1)}`);
    if (client.phone2) lines.push(`TEL;TYPE=WORK,VOICE:${esc(client.phone2)}`);
    if (client.phone3) lines.push(`TEL;TYPE=WORK,VOICE:${esc(client.phone3)}`);
    if (client.email1) lines.push(`EMAIL;TYPE=INTERNET:${esc(client.email1)}`);
    if (client.email2) lines.push(`EMAIL;TYPE=INTERNET:${esc(client.email2)}`);
    if (client.email3) lines.push(`EMAIL;TYPE=INTERNET:${esc(client.email3)}`);
    if (client.businessWebsite) lines.push(`URL:${esc(client.businessWebsite)}`);
    if (client.portfolioWebsite) lines.push(`X-PORTFOLIO:${esc(client.portfolioWebsite)}`);
    if (client.address) {
        lines.push(`ADR;TYPE=WORK:;;${esc(client.address)};;;;`);
    }
    if (client.bio) lines.push(`NOTE:${esc(client.bio)}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
};

// Generate PDF (Puppeteer) and upload to Cloudinary (raw)
const generateAndUploadPdf = async (clientData) => {
    let browser;
    try {
        const htmlContent = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${clientData.fullName} - SmartCardLink</title>
<style>
body { font-family: Arial, sans-serif; padding: 20px; color: #222; }
.container { max-width: 700px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
.photo { width: 150px; height: 150px; border-radius: 50%; object-fit: cover; display:block; margin: 0 auto 20px auto; }
h1 { text-align:center; color: #111; }
.info p { margin: 6px 0; }
.label { font-weight: bold; }
</style>
</head>
<body>
    <div class="container">
        ${clientData.photoUrl ? `<img src="${clientData.photoUrl}" class="photo" />` : ""}
        <h1>${clientData.fullName || ""}</h1>
        <h3 style="text-align:center;">${clientData.company || ""} — ${clientData.title || ""}</h3>
        <div class="info">
            <p><span class="label">Phone:</span> ${clientData.phone1 || "N/A"}</p>
            <p><span class="label">Email:</span> ${clientData.email1 || "N/A"}</p>
            <p><span class="label">Address:</span> ${clientData.address || "N/A"}</p>
            <p><span class="label">Bio:</span> ${clientData.bio || "N/A"}</p>
        </div>
    </div>
</body>
</html>`;

        // 1. Puppeteer in Production: Docker-friendly path and puppeteer-core
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ||
            (process.platform === 'linux' ? '/usr/bin/chromium-browser' : undefined) ||
            (process.env.NODE_ENV === 'production' ? '/usr/bin/google-chrome-stable' : undefined);

        if (!executablePath) {
            logger.warn("PUPPETEER_EXECUTABLE_PATH not set. Using default puppeteer-core logic.");
        }

        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            executablePath: executablePath // This will point to the installed chrome/chromium in a container
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

        const uploadRes = await uploadToCloudinary(pdfBuffer, `client_info_${clientData.slug || Date.now()}`, "raw", "smartcardlink_client_pdfs");
        return uploadRes.secure_url;
    } catch (err) {
        logger.error({ err }, "❌ generateAndUploadPdf error");
        throw err;
    } finally {
        if (browser) await browser.close();
    }
};

// 2. PDF Streaming: Fetch wrapper with retry logic
const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        // 2. PDF Streaming: AbortController created inside the loop
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (response.ok) return response;
            
            throw new Error(`Fetch failed with status ${response.status}`);
        } catch (error) {
            clearTimeout(timeout);
            if (i === retries - 1) {
                logger.error({ url, error, attempt: i + 1 }, "Cloudinary fetch failed after all retries.");
                throw error;
            }
            if (error.name === 'AbortError') {
                logger.warn({ url, attempt: i + 1 }, "Cloudinary fetch timed out (AbortError), retrying...");
            } else {
                logger.warn({ url, error, attempt: i + 1 }, "Cloudinary fetch failed, retrying...");
            }
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // Exponential backoff
        }
    }
};

// ------------------------
// Routes - public/static
// ------------------------
app.get("/", (req, res) => {
    const indexPath = path.join(staticPath, "index.html");
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    return res.send("SmartCardLink API - Frontend assets missing.");
});

// Health endpoint
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// ------------------------
// API - Clients & Admin
// ------------------------

// Create client (public)
app.post("/api/clients", publicLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        if (!body.fullName || !body.phone1 || !body.email1 || !body.company) {
            return respError(res, "Missing required fields: fullName, phone1, email1, company", 400);
        }
        
        const slug = await generateUniqueSlug(body.fullName);
        const clientDoc = new Client({
            ...body,
            slug,
            status: "pending",
        });

        // Use semaphore with graceful handling for initial PDF generation
        const release = await pdfSemaphore.acquire(MAX_PDF_WAIT_MS).catch(() => null);
        if (release) {
            try {
                const pdfUrl = await generateAndUploadPdf({ ...body, slug });
                clientDoc.pdfUrl = pdfUrl;
            } catch (err) {
                logger.warn({ err }, "⚠️ PDF generation failed during client creation");
            } finally {
                release();
            }
        } else {
            logger.warn("PDF semaphore queue full. Skipping initial PDF generation.");
        }

        await clientDoc.save();
        await logAction("public", "CLIENT_CREATED", clientDoc._id, "Client submitted via public form", { snapshot: clientDoc });

        if (ADMIN_EMAIL) {
            try {
                await transporter.sendMail({
                    from: `SmartCardLink <${SMTP_USER}>`,
                    to: ADMIN_EMAIL,
                    subject: `New SmartCardLink submission: ${clientDoc.fullName}`,
                    text: `New client submitted. ID: ${clientDoc._id} — ${clientDoc.fullName}`,
                });
            } catch (err) {
                logger.warn({ err }, "⚠️ Admin email notify failed");
            }
        }

        return respSuccess(res, { recordId: clientDoc._id }, "Saved. Pending admin processing.", 201);
    } catch (err) {
        logger.error({ err }, "❌ POST /api/clients error");
        return respError(res, err?.message || "Server error", 500, null, err);
    }
});

// Public clients listing (lightweight)
app.get("/api/clients/all", async (req, res) => {
    try {
        const clients = await Client.find({}, "fullName company email1 phone1 status createdAt photoUrl slug").sort({ createdAt: -1 }).limit(200);
        return respSuccess(res, clients, "Public clients list");
    } catch (err) {
        logger.error({ err }, "❌ GET /api/clients/all error");
        return respError(res, "Server error fetching clients", 500, null, err);
    }
});

// Admin listing with filters (canonical)
app.get("/api/admin/clients", async (req, res) => {
    try {
        const { q, status, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (q) {
            const regex = new RegExp(q, "i");
            filter.$or = [{ fullName: regex }, { email1: regex }, { phone1: regex }, { company: regex }];
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [total, clients] = await Promise.all([
            Client.countDocuments(filter),
            Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        ]);
        const meta = { total, page: Number(page), limit: Number(limit) };
        return respSuccess(res, clients, "Clients list", 200, meta);
    } catch (err) {
        logger.error({ err }, "❌ GET /api/admin/clients error");
        return respError(res, "Server error fetching clients", 500, null, err);
    }
});

// Get single client + recentLogs
app.get("/api/clients/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found.", 404);
        const recentLogs = await Log.find({ targetClientId: client._id }).sort({ timestamp: -1 }).limit(50);
        return respSuccess(res, { client, recentLogs }, "Client fetched.");
    } catch (err) {
        logger.error({ err }, "❌ GET /api/clients/:id error");
        return respError(res, "Server error fetching client.", 500, null, err);
    }
});

// Photo upload (general)
app.post("/api/upload-photo", upload.single("photo"), async (req, res) => {
    try {
        if (!req.file) return respError(res, "No file uploaded", 400);
        const url = req.file.path || req.file.secure_url || (req.file && req.file.url) || "";
        return respSuccess(res, { photoUrl: url }, "Photo uploaded successfully");
    } catch (err) {
        logger.error({ err }, "❌ POST /api/upload-photo error");
        return respError(res, "Upload error", 500, null, err);
    }
});

// Update client (JSON or multipart/form-data with photo)
app.put("/api/clients/:id", upload.single("photo"), async (req, res) => {
    try {
        const id = req.params.id;
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found.", 404);

        const incoming = { ...(req.body || {}) };

        // Handle photo upload
        if (req.file) {
            const photoUrl = req.file.path || req.file.secure_url || req.file.url || "";
            if (photoUrl) {
                incoming.photoUrl = photoUrl;
                client.history.push({ action: "PHOTO_UPLOADED", notes: "Photo updated by admin", actor: "admin" });
                await logAction("admin", "PHOTO_UPLOADED", client._id, "Photo uploaded", { photoUrl });
            }
        }

        // Merge fields (only allow known fields)
        const allowedFields = [
            "fullName", "title", "phone1", "phone2", "phone3", "email1", "email2", "email3",
            "company", "businessWebsite", "portfolioWebsite", "locationMap", "bio",
            "address", "photoUrl",
        ];
        // SocialLinks and workingHours parsing
        if (incoming.socialLinks && typeof incoming.socialLinks === "string") {
            try { incoming.socialLinks = JSON.parse(incoming.socialLinks); } catch (e) {
                logger.warn("Failed to parse socialLinks string");
            }
        }
        if (incoming.workingHours && typeof incoming.workingHours === "string") {
            try { incoming.workingHours = JSON.parse(incoming.workingHours); } catch (e) {
                logger.warn("Failed to parse workingHours string");
            }
        }

        // Apply changes
        for (const key of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(incoming, key) && incoming[key] !== undefined) {
                client[key] = incoming[key];
            }
        }
        if (incoming.socialLinks && typeof incoming.socialLinks === "object") {
            client.socialLinks = { ...client.socialLinks, ...incoming.socialLinks };
        }
        if (incoming.workingHours && typeof incoming.workingHours === "object") {
            client.workingHours = { ...client.workingHours, ...incoming.workingHours };
        }

        // Update slug if necessary
        if ((!client.slug || client.slug.trim() === "") && client.fullName) {
            client.slug = await generateUniqueSlug(client.fullName);
        }

        client.status = client.status === "pending" ? client.status : client.status;
        client.history.push({ action: "CLIENT_UPDATED", notes: "Admin saved info", actor: "admin" });

        await client.save();
        await logAction("admin", "CLIENT_UPDATED", client._id, "Admin saved client info", { incoming });

        return respSuccess(res, client, "Client updated successfully");
    } catch (err) {
        logger.error({ err }, "❌ PUT /api/clients/:id error");
        return respError(res, "Server error saving client info.", 500, null, err);
    }
});

// Create vCard: generate .vcf, QR, update client, send email
app.post("/api/clients/:id/vcard", async (req, res) => {
    try {
        const id = req.params.id;
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found.", 404);

        if (!client.fullName || (!client.phone1 && !client.email1)) {
            return respError(res, "Client must have fullName and at least one contact (phone1 or email1).", 400);
        }

        if (!client.slug || client.slug.trim() === "") {
            client.slug = await generateUniqueSlug(client.fullName);
        }

        // 6. Miscellaneous: publicVcardPage check (vcard.${slug}) -> Corrected to /vcard/slug
        const publicVcardPage = `${APP_BASE_URL.replace(/\/$/, "")}/vcard/${client.slug}`;

        // 1) Generate vCard content (.vcf)
        const vcfContent = generateVcardContent(client);
        const vcfBuffer = Buffer.from(vcfContent, "utf-8");

        // 2) Upload .vcf to Cloudinary as raw
        let vcardFileResult;
        try {
            vcardFileResult = await uploadToCloudinary(vcfBuffer, client.slug, "raw", "smartcardlink_vcards");
            client.vcardFileUrl = vcardFileResult.secure_url || vcardFileResult.url || "";
        } catch (err) {
            logger.error({ err }, "❌ vCard raw upload failed");
            return respError(res, "Failed uploading vCard file", 500, null, err);
        }

        // 3) Generate QR buffer
        const qrBuffer = await QRCode.toBuffer(publicVcardPage, { type: "png", margin: 1, width: 400 });

        // 4) Upload QR image to Cloudinary
        let qrUploadResult;
        try {
            qrUploadResult = await uploadToCloudinary(qrBuffer, `${client.slug}_qr`, "image", "smartcardlink_qrcodes");
            client.qrCodeUrl = qrUploadResult.secure_url || qrUploadResult.url || "";
        } catch (err) {
            logger.error({ err }, "❌ QR upload failed");
            return respError(res, "Failed uploading QR code", 500, null, err);
        }

        // 5) Update client public link and status
        client.vcardUrl = publicVcardPage;
        client.status = "processed";
        client.history.push({ action: "VCARD_CREATED", notes: "vCard created & uploaded", actor: "admin" });
        await client.save();
        await logAction("admin", "VCARD_CREATED", client._id, null, { vcardFileUrl: client.vcardFileUrl, qrCodeUrl: client.qrCodeUrl, publicPage: client.vcardUrl });

        // 6) Send email
        const emailRes = await sendVCardEmail(client);

        return respSuccess(
            res,
            { vcardUrl: client.vcardUrl, qrCodeUrl: client.qrCodeUrl, slug: client.slug, vcardFileUrl: client.vcardFileUrl },
            `vCard created. Email ${emailRes.success ? "sent" : "failed to send"}.`
        );
    } catch (err) {
        logger.error({ err }, "❌ POST /api/clients/:id/vcard error");
        return respError(res, "Server error creating vCard.", 500, null, err);
    }
});

// Stream or redirect client PDF
app.get("/api/clients/:id/pdf", async (req, res) => {
    // 1. Puppeteer in Production: Graceful queue full handling
    const release = await pdfSemaphore.acquire(MAX_PDF_WAIT_MS).catch(() => null);
    if (!release) {
        return respError(res, "PDF generation service is currently busy. Please try again in a moment.", 503);
    }

    try {
        const id = req.params.id;
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found", 404);

        let pdfUrlToStream = client.pdfUrl;
        let pdfResponse;
        let isRegenerated = false;

        if (pdfUrlToStream) {
            // Attempt to fetch existing PDF from Cloudinary
            try {
                // 2. PDF Streaming: Use fetchWithRetry
                pdfResponse = await fetchWithRetry(pdfUrlToStream);
            } catch (err) {
                logger.warn({ err }, "⚠️ Proxy of existing PDF failed, will regenerate.");
                pdfUrlToStream = null; // Force regeneration
            }
        }

        // Generate PDF if fetch failed or URL was missing
        if (!pdfUrlToStream) {
            const newPdfUrl = await generateAndUploadPdf(client);
            client.pdfUrl = newPdfUrl;
            client.history.push({ action: "PDF_GENERATED_ON_DEMAND", actor: "admin", notes: "Generated on view request" });
            await client.save();
            await logAction("admin", "PDF_GENERATED_ON_DEMAND", client._id, null, { pdfUrl: newPdfUrl });
            isRegenerated = true;
            
            // Stream the newly generated PDF (with retries)
            try {
                pdfResponse = await fetchWithRetry(newPdfUrl);
            } catch (err) {
                return respError(res, "Failed to stream newly generated PDF", 500, null, err);
            }
        }

        // Stream the final PDF
        if (!pdfResponse || !pdfResponse.ok) {
             // This case should not be reached if fetchWithRetry works, but as a final safety check:
             throw new Error("Final PDF fetch failed or was empty.");
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="client_${client.slug || client._id}.pdf"`);
        await logAction("admin", isRegenerated ? "PDF_GENERATED_AND_VIEWED" : "PDF_VIEWED", client._id, null, { pdfUrl: client.pdfUrl });
        return pdfResponse.body.pipe(res);

    } catch (err) {
        logger.error({ err }, "❌ GET /api/clients/:id/pdf error");
        return respError(res, "Server error retrieving/generating PDF.", 500, null, err);
    } finally {
        release();
    }
});

// Status change (requires notes)
app.put("/api/clients/:id/status/:newStatus", async (req, res) => {
    try {
        const id = req.params.id;
        const newStatus = (req.params.newStatus || "").toLowerCase();
        const allowed = ["pending", "processed", "approved", "rejected", "disabled", "deleted"];
        if (!allowed.includes(newStatus)) return respError(res, "Invalid status provided", 400);

        const notes = req.body?.notes || "";
        if (!notes || String(notes).trim().length < 3) return respError(res, "Notes are required and must be at least 3 characters long", 400);

        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found", 404);

        const previous = client.status;
        client.status = newStatus;
        client.history.push({ action: "STATUS_CHANGED", notes, actor: "admin" });
        await client.save();

        await logAction("admin", "STATUS_CHANGED", client._id, notes, { previousStatus: previous, newStatus });
        return respSuccess(res, client, `Client status updated to ${newStatus}`);
    } catch (err) {
        logger.error({ err }, "❌ PUT /api/clients/:id/status/:newStatus error");
        return respError(res, "Server error updating status", 500, null, err);
    }
});

// Delete client (soft-delete) - requires notes
app.delete("/api/clients/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const notes = req.body?.notes || "";
        if (!notes || String(notes).trim().length < 3) return respError(res, "Notes are required for deletion", 400);

        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found", 404);

        client.status = "deleted";
        client.history.push({ action: "CLIENT_DELETED", notes, actor: "admin" });
        await client.save();
        await logAction("admin", "CLIENT_DELETED", client._id, notes, null);

        return respSuccess(res, client, "Client marked as deleted");
    } catch (err) {
        logger.error({ err }, "❌ DELETE /api/clients/:id error");
        return respError(res, "Server error deleting client", 500, null, err);
    }
});

// Export client as .vcf raw (redirect to file or stream)
app.get("/vcard/:idOrSlug", async (req, res) => {
    try {
        const key = req.params.idOrSlug;
        let client = mongoose.Types.ObjectId.isValid(key) ? await Client.findById(key) : await Client.findOne({ slug: key });

        if (!client || ["disabled", "deleted"].includes(client.status)) return res.status(404).send("vCard not found or disabled/deleted");
        if (!client.vcardFileUrl) return res.status(404).send("vCard file not generated");

        await logAction("public", "VCARD_DOWNLOADED", client._id, `vCard raw file requested by ${req.ip}`, null);

        // Security: Ensure the redirect URL is valid (Cloudinary URL should be fine)
        if (!client.vcardFileUrl.startsWith('https://res.cloudinary.com')) {
             logger.error({ vcardFileUrl: client.vcardFileUrl }, "Attempted vCard redirect to non-Cloudinary URL");
             return res.status(500).send("Invalid vCard file URL.");
        }

        res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${client.slug}.vcf"`);
        return res.redirect(302, client.vcardFileUrl);
    } catch (err) {
        logger.error({ err }, "❌ GET /vcard/:idOrSlug error");
        return res.status(500).send("Error accessing vCard");
    }
});

// Public vCard JSON by slug or id (canonical)
app.get("/api/vcard/:idOrSlug", async (req, res) => {
    try {
        const key = req.params.idOrSlug;
        let client = mongoose.Types.ObjectId.isValid(key) ? await Client.findById(key) : await Client.findOne({ slug: key });

        if (!client || ["disabled", "deleted"].includes(client.status)) return respError(res, "Client not found or disabled.", 404);
        
        // Filter sensitive data before sending to public client
        const publicClientData = (({ _id, fullName, title, phone1, email1, company, businessWebsite, portfolioWebsite, locationMap, bio, address, socialLinks, workingHours, photoUrl, vcardUrl, qrCodeUrl, slug, status }) => 
            ({ _id, fullName, title, phone1, email1, company, businessWebsite, portfolioWebsite, locationMap, bio, address, socialLinks, workingHours, photoUrl, vcardUrl, qrCodeUrl, slug, status }))(client.toObject());

        await logAction("public", "VCARD_VIEWED", client._id, `Public vCard JSON requested by ${req.ip}`, null);

        return respSuccess(res, publicClientData, "Public vCard data fetched.");
    } catch (err) {
        logger.error({ err }, "❌ GET /api/vcard/:idOrSlug error");
        return respError(res, "Server error fetching vCard data.", 500, null, err);
    }
});

// ------------------------
// Server Start
// ------------------------
app.listen(PORT, HOST, () => {
    logger.info(`🚀 Server running at http://${HOST}:${PORT}`);
    logger.info(`Base URL is ${APP_BASE_URL}`);
    logger.info(`Allowed CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
});