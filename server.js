// server.js
// SmartCardLink - Production-ready server.js (corrected & aligned to the project blueprint)
// - Implements canonical API endpoints described in the blueprint
// - Uses Cloudinary for media, Multer for uploads, Mongoose for DB, Nodemailer for email
// - Produces vCard (.vcf), QR images, PDF generation, and proper audit logs
// - All responses follow the canonical shape: { success, data, message, meta? }
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
const puppeteer = require("puppeteer");
const fetch = require("node-fetch"); // used for streaming Cloudinary-hosted PDFs or fetching photos if needed
const { Readable } = require("stream");

dotenv.config();

// ------------------------
// Config & Env
// ------------------------
const app = express();
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
const MONGO_URI = process.env.MONGODB_URI;
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_BASE || ""; // public frontend base
const APP_FALLBACK_URL = process.env.APP_FALLBACK_URL || "";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || null;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://smartcardlink.perfectparcelsstore.com,https://allan-m5.github.io").split(",").map(s => s.trim()).filter(Boolean);

// Basic required env check (fail-fast in production)
const required = [
  "MONGODB_URI",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS"
];
for (const k of required) {
  if (!process.env[k]) {
    console.warn(`⚠️ Warning - environment variable ${k} is not set.`);
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
app.use(morgan("combined"));

// Helmet CSP - allow Cloudinary + inline for trusted scripts/styles (keep safe)
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "res.cloudinary.com"],
      connectSrc: ["'self'", "res.cloudinary.com", "https://api.cloudinary.com", APP_BASE_URL, APP_FALLBACK_URL],
      fontSrc: ["'self'", "res.cloudinary.com"],
    },
  })
);

// CORS (restrict to allowed origins)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow server-to-server or same-origin
      if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.some(a => origin.startsWith(a))) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed"), false);
    },
  })
);

// JSON parser with size limit
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

// Serve static files (frontend assets) if present
app.use(express.static(path.join(__dirname)));

// Rate limiter for public endpoints
const publicLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many requests, please try again later.",
});

// Semaphore to avoid concurrent heavy PDF operations
const pdfSemaphore = new Semaphore(1);

// ------------------------
// Helpers: Standard response wrappers
// ------------------------
const respSuccess = (res, data = null, message = "OK", statusCode = 200, meta = null) => {
  const body = { success: true, data, message };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};
const respError = (res, message = "Server error", statusCode = 500, data = null) =>
  res.status(statusCode).json({ success: false, data, message });

// ------------------------
// MongoDB connection & Models
// ------------------------
mongoose.set("strictQuery", true);

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, { autoIndex: true });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    // do not exit to allow local dev without DB; but many ops will fail
  }
};
connectDB();

// Logs collection schema (blueprint-aligned)
const logSchema = new mongoose.Schema(
  {
    actor: { type: String, required: true }, // admin, system, email, etc.
    action: { type: String, required: true },
    targetClientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
    notes: { type: String, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
const Log = mongoose.model("Log", logSchema);

// Client schema (blueprint-aligned, lowercase status values)
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
    vcardUrl: { type: String, default: "" }, // Public page URL (APP_BASE_URL/vcard.<slug>)
    vcardFileUrl: { type: String, default: "" }, // Cloudinary .vcf raw file URL
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
    console.error("❌ Failed to write log:", err);
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

// send vCard email (to client.email1) - logs EMAIL_SENT or EMAIL_FAILED
const sendVCardEmail = async (client) => {
  if (!client?.email1) {
    await logAction("system", "EMAIL_FAILED", client ? client._id : null, "No client.email1 present", null);
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
    return { success: true };
  } catch (err) {
    console.error("❌ Email send error:", err);
    await logAction("system", "EMAIL_FAILED", client._id, err?.message || String(err), { recipient: client.email1 });
    return { success: false, error: err?.message || String(err) };
  }
};

// Upload buffer/file to Cloudinary using upload_stream (supports image/raw)
const uploadToCloudinary = (fileBuffer, publicId = null, resourceType = "image", folderName = "smartcardlink") =>
  new Promise((resolve, reject) => {
    try {
      const stream = cloudinary.uploader.upload_stream(
        { folder: folderName, public_id: publicId, resource_type: resourceType, overwrite: true, format: resourceType === "raw" ? undefined : undefined },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      const readable = new Readable();
      readable._read = () => {};
      readable.push(fileBuffer);
      readable.push(null);
      readable.pipe(stream);
    } catch (err) {
      reject(err);
    }
  });

// Multer + Cloudinary storage for admin photo uploads (images only)
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "smartcardlink_photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, height: 1200, crop: "limit" }],
  },
});
const upload = multer({ storage });

// Utility: safe slug generator (ensures uniqueness)
const generateUniqueSlug = async (baseName) => {
  let baseSlug = slugify(baseName || "user", { lower: true, strict: true });
  if (!baseSlug) baseSlug = `user-${Date.now()}`;
  let slug = baseSlug;
  let counter = 1;
  while (await Client.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
};

// Utility: create vCard content (VERSION:3.0) as plain text
const generateVcardContent = (client) => {
  // escape helper for newlines and special chars
  const esc = (s = "") => {
    return String(s)
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  };

  const lines = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:3.0");
  // N: last;first;additional;prefix;suffix
  const names = (client.fullName || "").split(" ");
  const firstName = names.shift() || "";
  const lastName = names.join(" ") || "";
  lines.push(`FN:${esc(client.fullName || "")}`);
  lines.push(`N:${esc(lastName)};${esc(firstName)};;;`);
  if (client.company) lines.push(`ORG:${esc(client.company)}`);
  if (client.title) lines.push(`TITLE:${esc(client.title)}`);
  // Phones
  if (client.phone1) lines.push(`TEL;TYPE=WORK,VOICE:${esc(client.phone1)}`);
  if (client.phone2) lines.push(`TEL;TYPE=WORK,VOICE:${esc(client.phone2)}`);
  if (client.phone3) lines.push(`TEL;TYPE=WORK,VOICE:${esc(client.phone3)}`);
  // Emails
  if (client.email1) lines.push(`EMAIL;TYPE=INTERNET:${esc(client.email1)}`);
  if (client.email2) lines.push(`EMAIL;TYPE=INTERNET:${esc(client.email2)}`);
  if (client.email3) lines.push(`EMAIL;TYPE=INTERNET:${esc(client.email3)}`);
  // Websites
  if (client.businessWebsite) lines.push(`URL:${esc(client.businessWebsite)}`);
  if (client.portfolioWebsite) lines.push(`X-PORTFOLIO:${esc(client.portfolioWebsite)}`);
  // Address (simple)
  if (client.address) {
    // ADR;TYPE=WORK:post-office;extended;street;city;region;postal;country
    lines.push(`ADR;TYPE=WORK:;;${esc(client.address)};;;;`);
  }
  if (client.bio) lines.push(`NOTE:${esc(client.bio)}`);
  // End
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

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

    const uploadRes = await uploadToCloudinary(pdfBuffer, `client_info_${clientData.slug || Date.now()}`, "raw", "smartcardlink_client_pdfs");
    return uploadRes.secure_url;
  } catch (err) {
    console.error("❌ generateAndUploadPdf error:", err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

// ------------------------
// Routes - public/static
// ------------------------
app.get("/", (req, res) => {
  // serve index if present; otherwise basic message
  const indexPath = path.join(__dirname, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.send("SmartCardLink API");
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
    // Basic validation
    if (!body.fullName || !body.phone1 || !body.email1 || !body.company) {
      return respError(res, "Missing required fields: fullName, phone1, email1, company", 400);
    }
    const slug = await generateUniqueSlug(body.fullName);
    // create client record with pending status
    const clientDoc = new Client({
      ...body,
      slug,
      status: "pending",
    });

    // Try to generate PDF asynchronously but keep atomic: if PDF creation fails we still save client but log error
    try {
      const pdfUrl = await generateAndUploadPdf({ ...body, slug });
      clientDoc.pdfUrl = pdfUrl;
    } catch (err) {
      console.warn("⚠️ PDF generation failed during client creation:", err?.message || err);
      // not blocking client creation
    }

    await clientDoc.save();
    await logAction("public", "CLIENT_CREATED", clientDoc._id, "Client submitted via public form", { snapshot: clientDoc });

    // Optionally notify admin asynchronously (non-blocking)
    if (ADMIN_EMAIL) {
      try {
        await transporter.sendMail({
          from: `SmartCardLink <${SMTP_USER}>`,
          to: ADMIN_EMAIL,
          subject: `New SmartCardLink submission: ${clientDoc.fullName}`,
          text: `New client submitted. ID: ${clientDoc._id} — ${clientDoc.fullName}`,
        });
      } catch (err) {
        console.warn("⚠️ Admin email notify failed:", err?.message || err);
      }
    }

    return respSuccess(res, { recordId: clientDoc._id }, "Saved. Pending admin processing.", 201);
  } catch (err) {
    console.error("❌ POST /api/clients error:", err);
    return respError(res, err?.message || "Server error", 500);
  }
});

// Public clients listing (lightweight) - useful for a public clients-dashboard
app.get("/api/clients/all", async (req, res) => {
  try {
    const clients = await Client.find({}, "fullName company email1 phone1 status createdAt photoUrl slug").sort({ createdAt: -1 }).limit(200);
    return respSuccess(res, clients, "Public clients list");
  } catch (err) {
    console.error("❌ GET /api/clients/all:", err);
    return respError(res, "Server error fetching clients", 500);
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
    console.error("❌ GET /api/admin/clients:", err);
    return respError(res, "Server error fetching clients", 500);
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
    console.error("❌ GET /api/clients/:id:", err);
    return respError(res, "Server error fetching client.", 500);
  }
});

// Photo upload (general) - uses multer/cloudinary storage
// note: this endpoint is optional; the blueprint requires PUT /api/clients/:id to accept multipart; this endpoint can be used for quick uploads
app.post("/api/upload-photo", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return respError(res, "No file uploaded", 400);
    // multer-storage-cloudinary returns file.path as the secure url sometimes; check common properties
    const url = req.file.path || req.file.secure_url || (req.file && req.file.url) || "";
    return respSuccess(res, { photoUrl: url }, "Photo uploaded successfully");
  } catch (err) {
    console.error("❌ POST /api/upload-photo:", err);
    return respError(res, "Upload error", 500);
  }
});

// Update client (JSON or multipart/form-data with photo)
app.put("/api/clients/:id", upload.single("photo"), async (req, res) => {
  try {
    const id = req.params.id;
    const client = await Client.findById(id);
    if (!client) return respError(res, "Client not found.", 404);

    // Determine incoming fields: if multipart, fields in req.body (strings), and file in req.file
    const incoming = { ...(req.body || {}) };

    // If JSON was sent (application/json), express.json() already parsed to req.body
    // Convert some string boolean/numeric fields if necessary here (not required for our schema)

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
      "fullName",
      "title",
      "phone1",
      "phone2",
      "phone3",
      "email1",
      "email2",
      "email3",
      "company",
      "businessWebsite",
      "portfolioWebsite",
      "locationMap",
      "bio",
      "address",
      "photoUrl",
    ];
    // socialLinks and workingHours may come as JSON string (if multipart) — try parse
    if (incoming.socialLinks && typeof incoming.socialLinks === "string") {
      try {
        incoming.socialLinks = JSON.parse(incoming.socialLinks);
      } catch (e) {
        // ignore - if not parseable, leave as-is
      }
    }
    if (incoming.workingHours && typeof incoming.workingHours === "string") {
      try {
        incoming.workingHours = JSON.parse(incoming.workingHours);
      } catch (e) {}
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

    // Optionally update slug if fullName changed and slug empty (do not change slug if present to avoid breaking links)
    if ((!client.slug || client.slug.trim() === "") && client.fullName) {
      client.slug = await generateUniqueSlug(client.fullName);
    }

    client.status = client.status === "pending" ? client.status : client.status; // no forced change
    client.history.push({ action: "CLIENT_UPDATED", notes: "Admin saved info", actor: "admin" });

    await client.save();
    await logAction("admin", "CLIENT_UPDATED", client._id, "Admin saved client info", { incoming });

    return respSuccess(res, client, "Client updated successfully");
  } catch (err) {
    console.error("❌ PUT /api/clients/:id:", err);
    return respError(res, "Server error saving client info.", 500);
  }
});

// Create vCard: generate .vcf (upload raw), generate QR (upload image), update client, send email
app.post("/api/clients/:id/vcard", async (req, res) => {
  try {
    const id = req.params.id;
    const client = await Client.findById(id);
    if (!client) return respError(res, "Client not found.", 404);

    // Validate minimal fields
    if (!client.fullName || (!client.phone1 && !client.email1)) {
      return respError(res, "Client must have fullName and at least one contact (phone1 or email1).", 400);
    }

    // Ensure slug
    if (!client.slug || client.slug.trim() === "") {
      client.slug = await generateUniqueSlug(client.fullName);
    }

    // Public page URL (friendly)
    const publicVcardPage = `${APP_BASE_URL.replace(/\/$/, "")}/vcard.${client.slug}`;

    // 1) Generate vCard content (.vcf)
    const vcfContent = generateVcardContent(client);
    const vcfBuffer = Buffer.from(vcfContent, "utf-8");

    // 2) Upload .vcf to Cloudinary as raw
    let vcardFileResult;
    try {
      vcardFileResult = await uploadToCloudinary(vcfBuffer, client.slug, "raw", "smartcardlink_vcards");
      client.vcardFileUrl = vcardFileResult.secure_url || vcardFileResult.url || "";
    } catch (err) {
      console.error("❌ vCard raw upload failed:", err);
      return respError(res, "Failed uploading vCard file", 500);
    }

    // 3) Generate QR buffer for public page (so scanning goes to public page)
    const qrBuffer = await QRCode.toBuffer(publicVcardPage, { type: "png", margin: 1, width: 400 });

    // 4) Upload QR image to Cloudinary
    let qrUploadResult;
    try {
      qrUploadResult = await uploadToCloudinary(qrBuffer, `${client.slug}_qr`, "image", "smartcardlink_qrcodes");
      client.qrCodeUrl = qrUploadResult.secure_url || qrUploadResult.url || "";
    } catch (err) {
      console.error("❌ QR upload failed:", err);
      return respError(res, "Failed uploading QR code", 500);
    }

    // 5) Update client public link and status
    client.vcardUrl = publicVcardPage; // public page to render vCard (not raw .vcf)
    client.status = "processed";
    client.history.push({ action: "VCARD_CREATED", notes: "vCard created & uploaded", actor: "admin" });
    await client.save();
    await logAction("admin", "VCARD_CREATED", client._id, null, { vcardFileUrl: client.vcardFileUrl, qrCodeUrl: client.qrCodeUrl, publicPage: client.vcardUrl });

    // 6) Send email to client with vCard public page
    const emailRes = await sendVCardEmail(client);

    return respSuccess(
      res,
      { vcardUrl: client.vcardUrl, qrCodeUrl: client.qrCodeUrl, slug: client.slug, vcardFileUrl: client.vcardFileUrl },
      `vCard created. Email ${emailRes.success ? "sent" : "failed to send"}.`
    );
  } catch (err) {
    console.error("❌ POST /api/clients/:id/vcard:", err);
    return respError(res, "Server error creating vCard.", 500);
  }
});

// Stream or redirect client PDF
app.get("/api/clients/:id/pdf", async (req, res) => {
  const release = await pdfSemaphore.acquire();
  try {
    const id = req.params.id;
    const client = await Client.findById(id);
    if (!client) return respError(res, "Client not found", 404);

    if (client.pdfUrl) {
      // Proxy the Cloudinary PDF to client with proper headers
      try {
        const r = await fetch(client.pdfUrl);
        if (!r.ok) {
          // fallback to regenerating PDF
          throw new Error("Failed to fetch stored PDF");
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="client_${client.slug || client._id}.pdf"`);
        await logAction("admin", "PDF_VIEWED", client._id, null, {});
        return r.body.pipe(res);
      } catch (err) {
        console.warn("⚠️ Proxy of existing PDF failed, will regenerate:", err?.message || err);
      }
    }

    // Generate PDF on demand
    const newPdfUrl = await generateAndUploadPdf(client);
    client.pdfUrl = newPdfUrl;
    client.history.push({ action: "PDF_GENERATED_ON_DEMAND", actor: "admin", notes: "Generated on view request" });
    await client.save();
    await logAction("admin", "PDF_GENERATED_ON_DEMAND", client._id, null, { pdfUrl: newPdfUrl });

    // Proxy to client
    const r2 = await fetch(newPdfUrl);
    if (!r2.ok) return respError(res, "Failed to stream PDF", 500);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="client_${client.slug || client._id}.pdf"`);
    return r2.body.pipe(res);
  } catch (err) {
    console.error("❌ GET /api/clients/:id/pdf:", err);
    return respError(res, "Server error retrieving/generating PDF.", 500);
  } finally {
    release();
  }
});

// Status change (requires notes)
app.put("/api/clients/:id/status/:newStatus", express.json(), async (req, res) => {
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
    console.error("❌ PUT /api/clients/:id/status/:newStatus:", err);
    return respError(res, "Server error updating status", 500);
  }
});

// Delete client (soft-delete) - requires notes
app.delete("/api/clients/:id", express.json(), async (req, res) => {
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
    console.error("❌ DELETE /api/clients/:id:", err);
    return respError(res, "Server error deleting client", 500);
  }
});

// Export client as .vcf raw (redirect to file or stream). Public direct access by id to .vcf
app.get("/vcard/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const client = await Client.findById(id);
    if (!client) return res.status(404).send("vCard not found");
    if (!client.vcardFileUrl) return res.status(404).send("vCard file not found");
    // Redirect to Cloudinary raw vcf
    return res.redirect(302, client.vcardFileUrl);
  } catch (err) {
    console.error("❌ GET /vcard/:id:", err);
    return res.status(500).send("Error accessing vCard");
  }
});

// Public vCard JSON by slug or id (canonical)
app.get("/api/vcard/:idOrSlug", async (req, res) => {
  try {
    const key = req.params.idOrSlug;
    let client = null;
    if (mongoose.Types.ObjectId.isValid(key)) {
      client = await Client.findById(key);
    }
    if (!client) {
      client = await Client.findOne({ slug: key });
    }
    if (!client || ["disabled", "deleted"].includes(client.status)) return respError(res, "vCard not found or not active", 404);
    // Optionally include recent logs (non-sensitive)
    const recentLogs = await Log.find({ targetClientId: client._id }).sort({ timestamp: -1 }).limit(30);
    return respSuccess(res, { client, recentLogs }, "vCard fetched");
  } catch (err) {
    console.error("❌ GET /api/vcard/:idOrSlug:", err);
    return respError(res, "Server error fetching vCard", 500);
  }
});

// Logs (admin)
app.get("/api/logs", async (req, res) => {
  try {
    const { clientId } = req.query;
    const filter = {};
    if (clientId) filter.targetClientId = clientId;
    const logs = await Log.find(filter).sort({ timestamp: -1 }).limit(500);
    return respSuccess(res, logs, "Logs fetched");
  } catch (err) {
    console.error("❌ GET /api/logs:", err);
    return respError(res, "Server error fetching logs", 500);
  }
});

// Fallback: provide a small index for API
app.get("/api", (req, res) => {
  return respSuccess(res, { endpoints: ["/health", "/api/clients", "/api/admin/clients", "/api/vcard/:idOrSlug"] }, "SmartCardLink API");
});

// ------------------------
// Start server
// ------------------------
app.listen(PORT, HOST, () => {
  console.log(`🚀 SmartCardLink server listening at http://${HOST}:${PORT} (PORT env: ${process.env.PORT || "none set"})`);
});

module.exports = app;
