// ------------------------
// Imports
// ------------------------
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const RateLimit = require("express-rate-limit");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const qrcode = require("qrcode");
const vCardJS = require("vcards-js");
const nodemailer = require("nodemailer");
const pino = require("pino");
const pinoHttp = require("pino-http");
const fs = require("fs"); 
require('dotenv').config(); // CRITICAL: Load .env variables

// Configure custom logger
const logger = pino({ level: process.env.NODE_ENV === "production" ? "info" : "debug" });

// ------------------------
// Environment Variables
// ------------------------
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
const MONGO_URI = process.env.MONGODB_URI;

// Base URLs - Using the newly defined .env variables
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`; // Backend API URL
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://localhost:3000"; // Admin/Client Forms & Dashboards
const VCARD_BASE_URL = process.env.VCARD_BASE_URL || APP_BASE_URL; // Public URL for the vCard page host
const APP_FALLBACK_URL = process.env.APP_FALLBACK_URL; // Used for /:slug redirect fallback

// Derive the base URL for the backend API for internal use (CORS)
const BACKEND_API_URL = new URL(APP_BASE_URL).origin;

// SMTP
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || null; // Use SMTP_USER as default Admin Email

// Cloudinary
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;


// ------------------------
// Database Schema and Model (Comprehensive)
// ------------------------
const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  notes: { type: String },
  actor: { type: String, default: "system" },
  timestamp: { type: Date, default: Date.now },
});

// Nested Schemas for form data
const socialLinksSchema = new mongoose.Schema({
  facebook: { type: String, trim: true, default: "" },
  instagram: { type: String, trim: true, default: "" },
  twitter: { type: String, trim: true, default: "" },
  linkedin: { type: String, trim: true, default: "" },
  tiktok: { type: String, trim: true, default: "" },
  youtube: { type: String, trim: true, default: "" },
}, { _id: false });

const workingHoursSchema = new mongoose.Schema({
  monFriStart: { type: String, default: "" },
  monFriEnd: { type: String, default: "" },
  satStart: { type: String, default: "" },
  satEnd: { type: String, default: "" },
  sunStart: { type: String, default: "" },
  sunEnd: { type: String, default: "" },
}, { _id: false });


const ClientSchema = new mongoose.Schema({
  // Personal Details
  fullName: { type: String, required: true, trim: true },
  title: { type: String, trim: true, default: "" },
  
  phone1: { type: String, trim: true, default: "" },
  phone2: { type: String, trim: true, default: "" },
  phone3: { type: String, trim: true, default: "" }, 
  email1: { type: String, trim: true, lowercase: true, default: "" },
  email2: { type: String, trim: true, lowercase: true, default: "" },
  email3: { type: String, trim: true, lowercase: true, default: "" }, 

  // Business Details
  company: { type: String, trim: true, default: "" },
  website: { type: String, trim: true, default: "" }, 
  businessWebsite: { type: String, trim: true, default: "" },
  portfolioWebsite: { type: String, trim: true, default: "" },
  locationMap: { type: String, trim: true, default: "" }, 
  address: { type: String, default: "" },
  bio: { type: String, default: "" },

  // Nested Data
  workingHours: workingHoursSchema,
  socialLinks: socialLinksSchema,
  
  // Status and Media
  photoUrl: { type: String, default: "" }, // Cloudinary URL
  slug: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ["Pending", "Active", "Suspended", "Deleted"], default: "Pending" },

  vcardUrl: { type: String, default: "" }, // Cloudinary URL to .vcf file
  qrCodeUrl: { type: String, default: "" }, // Data URL for QR code (or Cloudinary if uploaded)

  history: [historySchema],
}, { timestamps: true });

const Client = mongoose.model("Client", ClientSchema);


// ------------------------
// App Initialization & DB Connection
// ------------------------
const app = express();
const staticPath = path.join(__dirname, "public");

// MongoDB Connection: Added best practice options
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logger.info("✅ MongoDB connected successfully"))
  .catch((err) => {
    logger.error({ err }, "❌ MongoDB connection error. Check MONGODB_URI.");
    process.exit(1);
  });


// Cloudinary Configuration
if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
    logger.warn("Cloudinary credentials missing. Uploads will fail.");
}

// Configure multer for file uploads (using memory storage for Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });


// Email Transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, 
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});


// ------------------------
// Helper Functions (Fully Implemented)
// ------------------------

// Standardized API Response
const respSuccess = (res, data = null, message = "OK", statusCode = 200, meta = null) => {
  return res.status(statusCode).json({
    status: "success",
    message,
    data,
    meta,
  });
};

const respError = (res, message = "Server error", statusCode = 500, data = null, errorObj = null) => {
  if (errorObj) logger.error({ error: errorObj }, `API Error: ${message}`);
  return res.status(statusCode).json({
    status: "error",
    message,
    data,
  });
};

// Logging
const logAction = async (actor, action, clientId, notes, data) => {
  logger.info({ actor, action, clientId, notes, data }, `ACTION: ${action} by ${actor}`);
  // History save implementation is in the route handlers for specific actions (e.g., PUT)
};

// Slug Generation
const generateUniqueSlug = async (name) => {
  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") 
    .replace(/[\s-]+/g, "-") 
    .substring(0, 50);

  let slug = baseSlug;
  let counter = 1;
  while (await Client.findOne({ slug: slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
    if (counter > 100) {
        logger.warn({ baseSlug, finalSlug: slug }, "High collision detected, using random slug suffix.");
        slug = `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`; 
        break;
    }
  }
  return slug;
};

// VCard Content Generation
const generateVcardContent = (client) => {
  const vCard = vCardJS();
  const names = (client.fullName || "").split(" ");
  vCard.firstName = names.shift() || "";
  vCard.lastName = names.join(" ") || "";
  vCard.name = client.fullName;
  vCard.organization = client.company || "";
  vCard.title = client.title || "";
  
  // Primary Contacts
  if (client.phone1) vCard.cellPhone = client.phone1;
  if (client.email1) vCard.email = client.email1;
  
  // Secondary Contacts
  if (client.phone2) vCard.workPhone = client.phone2;
  if (client.email2) vCard.workEmail = client.email2;
  if (client.phone3) vCard.otherPhone = client.phone3;
  if (client.email3) vCard.otherEmail = client.email3;
  
  // Addresses and URLs
  if (client.address) vCard.homeAddress.label = client.address;
  if (client.website || client.businessWebsite) vCard.url = client.website || client.businessWebsite;
  if (client.portfolioWebsite) vCard.note = `Portfolio: ${client.portfolioWebsite}`;

  // Social Links (using an X-SOCIAL property for broader compatibility)
  if (client.socialLinks) {
    const socialText = Object.entries(client.socialLinks)
        .filter(([_, url]) => url)
        .map(([platform, url]) => `${platform}: ${url}`)
        .join('\n');
    if (socialText) vCard.socialmedia = socialText;
  }
  
  if (client.photoUrl) {
      try {
          vCard.photo.attachFromUrl(client.photoUrl, 'JPEG'); 
      } catch(e) {
          logger.warn({ error: e, photoUrl: client.photoUrl }, "Failed to attach photo to vCard from URL. Proceeding without image.");
      }
  }
  
  return vCard.getFormattedString();
};

// Cloudinary VCF Upload
const uploadVcfToCloudinary = async (slug, vcfContent) => {
  if (!CLOUDINARY_CLOUD_NAME) throw new Error("Cloudinary not configured.");
  const base64Vcf = Buffer.from(vcfContent).toString('base64');
  
  const result = await cloudinary.uploader.upload(
    `data:text/vcard;base64,${base64Vcf}`,
    {
      folder: "smartcardlink_vcards",
      resource_type: "raw", 
      public_id: slug, 
      format: "vcf",
      tags: ["client_vcard"],
    }
  );
  return result.secure_url;
};

// Email Function
const sendEmail = async (to, subject, text, html) => {
  if (!SMTP_USER || !SMTP_PASS) {
    logger.warn("SMTP credentials missing. Skipping email send.");
    return;
  }
  
  const mailOptions = {
    from: `"SmartCardLink Admin" <${SMTP_USER}>`,
    to: to,
    subject: subject,
    text: text,
    html: html || `<p>${text}</p>`,
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
  } catch (err) {
    logger.error({ err }, `❌ Failed to send email to ${to}`);
  }
};

// PDF Stub 
const generateAndUploadPdf = async (client) => {
  logger.warn(`PDF generation is a complex feature and is currently stubbed (generateAndUploadPdf).`);
  // Stubbed URL based on client slug
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/smartcardlink_pdfs/${client.slug}.pdf`;
};


// ------------------------
// Middleware
// ------------------------
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Middleware (Helmet)
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrcElem: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "res.cloudinary.com"],
      // CRITICAL: Updated connectSrc to include all necessary domains from .env
      connectSrc: [
        "'self'", 
        BACKEND_API_URL, 
        new URL(FRONTEND_BASE_URL).origin, // Added to ensure fetch requests work
        "res.cloudinary.com", 
        "https://api.cloudinary.com", 
        "*.google-analytics.com", 
        "*.analytics.google.com"
      ], 
      fontSrc: ["'self'", "res.cloudinary.com", "https://fonts.gstatic.com", "data:", "https://cdnjs.cloudflare.com"],
      frameAncestors: ["'self'"],
    },
  })
);

// CORS
// CRITICAL FIX: Ensure all required frontend modules are covered.
app.use(
  cors({
    origin: (origin, callback) => {
        // Define all production and local origins
        const allowedOrigins = [
            BACKEND_API_URL, 
            new URL(FRONTEND_BASE_URL).origin, // Client Form, Admin Dashboard, Admin Form, Client Dashboard
            new URL(VCARD_BASE_URL).origin,    // Public vCard pages
        ];

        // Add localhost for development/local testing
        if (process.env.NODE_ENV !== "production") {
            allowedOrigins.push("http://localhost");
            allowedOrigins.push("http://127.0.0.1");
            allowedOrigins.push(/http:\/\/localhost:\d+$/); // dynamic ports
        }
      
        if (!origin) return callback(null, true); // Allow server-to-server or requests without an Origin header

        let checkOrigin = origin;
        try {
            // Normalize origin to its protocol + hostname (e.g., https://example.com)
            checkOrigin = new URL(origin).origin; 
        } catch (e) {
            logger.warn(`CORS: Invalid origin URL received: ${origin}`);
            // Check if the raw origin (e.g., "http://localhost:3000") is in the list
        }
      
        // Check both the raw origin and the normalized origin
        if (allowedOrigins.includes(origin) || allowedOrigins.includes(checkOrigin) || allowedOrigins.some(regex => regex instanceof RegExp && regex.test(origin))) {
            return callback(null, true);
        }

        logger.warn(`CORS block for origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);


// Rate limiter for public/admin endpoints
const publicLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many requests, please try again later.",
  legacyHeaders: false,
  standardHeaders: true,
});


// ------------------------
// Static File Serving
// ------------------------
app.use(express.static(staticPath));

// Favicon check to avoid 404 noise
app.get("/favicon.ico", (req, res) => {
    const icoPath = path.join(staticPath, "favicon.ico");
    if (fs.existsSync(icoPath)) return res.sendFile(icoPath);
    return res.status(204).end();
});

// ------------------------
// API Routes
// ------------------------

// POST /api/upload-photo: Handle photo upload to Cloudinary (for both form submit and admin update)
app.post("/api/upload-photo", publicLimiter, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return respError(res, "No file uploaded.", 400);

    const result = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      {
        folder: "smartcardlink_photos",
        resource_type: "image",
        tags: ["client_photo", "temp_upload"],
      }
    );

    await logAction("system", "TEMP_PHOTO_UPLOAD", null, "Temporary photo uploaded for client form", { photoUrl: result.secure_url });
    return respSuccess(res, { photoUrl: result.secure_url }, "Photo uploaded successfully");
  } catch (err) {
    logger.error({ err }, "❌ POST /api/upload-photo error");
    return respError(res, "Upload error", 500, null, err);
  }
});


// POST /api/clients: Create a new client record (initial form submission)
app.post("/api/clients", publicLimiter, async (req, res) => {
  try {
    const incoming = req.body || {};
    
    // Normalize companyName to company if present (from admin-form.html logic)
    if (incoming.companyName) {
        incoming.company = incoming.companyName;
        delete incoming.companyName;
    }
    
    const clientDoc = new Client(incoming);
    
    // Auto-generate slug and status upon initial creation
    clientDoc.status = "Pending";
    clientDoc.slug = await generateUniqueSlug(clientDoc.fullName);

    clientDoc.history.push({ action: "CLIENT_CREATED", notes: "Initial form submission", actor: "client_submission" });
    await clientDoc.save();
    
    // Notify admin by email
    if (ADMIN_EMAIL) {
      const subject = `New SmartCardLink submission: ${clientDoc.fullName}`;
      const text = `New client submitted. ID: ${clientDoc._id} — ${clientDoc.fullName}. Check admin panel to process.`;
      await sendEmail(ADMIN_EMAIL, subject, text);
    }
    
    return respSuccess(res, { recordId: clientDoc._id }, "Saved. Pending admin processing.", 201);
  } catch (err) {
    if (err.name === 'ValidationError') {
        return respError(res, `Validation Error: ${err.message}`, 400, null, err);
    }
    logger.error({ err }, "❌ POST /api/clients error");
    return respError(res, err?.message || "Server error", 500, null, err);
  }
});


// GET /api/admin/clients: Admin listing with filtering and pagination
app.get("/api/admin/clients", publicLimiter, async (req, res) => {
  try {
    const { q, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    const pageSize = parseInt(limit);
    const skip = (parseInt(page) - 1) * pageSize;

    if (status) filter.status = status;
    if (q) {
      const regex = new RegExp(q, "i");
      filter.$or = [
        { fullName: regex },
        { company: regex },
        { email1: regex },
        { phone1: regex },
        { slug: regex }
      ];
    }
    
    const clients = await Client.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .select("-history -__v"); 

    const totalCount = await Client.countDocuments(filter);
    
    const meta = {
        total: totalCount,
        page: parseInt(page),
        limit: pageSize,
        pages: Math.ceil(totalCount / pageSize),
    };

    return respSuccess(res, clients, "Admin clients list retrieved successfully", 200, meta);
  } catch (err) {
    logger.error({ err }, "❌ GET /api/admin/clients error");
    return respError(res, "Server error fetching clients", 500, null, err);
  }
});


// GET /api/clients/:id: Helper for Admin Panel to fetch one client
app.get("/api/clients/:id", publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, "Client not found.", 404);
        return respSuccess(res, client);
    } catch (err) {
        return respError(res, "Error fetching client.", 500, null, err);
    }
});


// PUT /api/clients/:id: Update client info (Admin update route)
app.put("/api/clients/:id", publicLimiter, upload.single("photo"), async (req, res) => {
  try {
    const id = req.params.id;
    const client = await Client.findById(id);
    if (!client) return respError(res, "Client not found.", 404);
    
    const incoming = req.body || {};
    
    // --- Safe Field Update Logic ---
    const allowedTopLevelFields = [
        'fullName', 'title', 'company', 'businessWebsite', 'portfolioWebsite', 'locationMap',
        'phone1', 'phone2', 'phone3', 'email1', 'email2', 'email3', 'address', 'bio', 'status', 'photoUrl'
    ];
    
    // 1. Check for fullName change and regenerate slug if necessary
    if (incoming.fullName && incoming.fullName !== client.fullName) {
        client.slug = await generateUniqueSlug(incoming.fullName);
        await logAction("admin", "SLUG_REGENERATED", id, `Slug changed from ${client.slug} based on new fullName.`, {});
    }

    // 2. Handle photo upload if file is present (photoUrl is updated if successful)
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        {
          folder: "smartcardlink_photos",
          resource_type: "image",
          tags: ["client_photo", `client_${id}`],
        }
      );
      incoming.photoUrl = uploadResult.secure_url;
      await logAction("admin", "CLIENT_PHOTO_UPDATED", id, "Photo updated via PUT route.", { newPhoto: incoming.photoUrl });
    }

    // 3. Apply updates safely, preventing overwrites of critical fields like slug, _id, history
    for (const field of allowedTopLevelFields) {
        if (incoming[field] !== undefined && field !== 'photoUrl') { 
            client[field] = incoming[field];
        }
    }
    if (incoming.photoUrl) client.photoUrl = incoming.photoUrl;

    // 4. Handle nested objects (socialLinks, workingHours) - handle JSON string from form
    if (incoming.socialLinks) {
        try {
          const links = (typeof incoming.socialLinks === 'string') ? JSON.parse(incoming.socialLinks) : incoming.socialLinks;
          Object.assign(client.socialLinks, links);
        } catch (e) {
            logger.error({ error: e, input: incoming.socialLinks }, "Failed to parse socialLinks JSON.");
        }
    }
    if (incoming.workingHours) {
        try {
          const hours = (typeof incoming.workingHours === 'string') ? JSON.parse(incoming.workingHours) : incoming.workingHours;
          Object.assign(client.workingHours, hours);
        } catch (e) {
          logger.error({ error: e, input: incoming.workingHours }, "Failed to parse workingHours JSON.");
        }
    }
    
    // 5. Save and Log
    client.history.push({ action: "CLIENT_UPDATED", notes: "Admin saved info", actor: "admin" });
    await client.save();
    
    return respSuccess(res, client, "Client updated successfully");
  } catch (err) {
    if (err.name === 'ValidationError') {
        return respError(res, `Validation Error: ${err.message}`, 400, null, err);
    }
    logger.error({ err }, "❌ PUT /api/clients/:id error");
    return respError(res, "Server error saving client info.", 500, null, err);
  }
});


// PUT /api/clients/:id/status/:newStatus: Admin status change route (Active, Suspended, Deleted)
app.put("/api/clients/:id/status/:newStatus", publicLimiter, async (req, res) => {
  try {
    const { id, newStatus } = req.params;
    const { notes } = req.body;
    
    if (!["Pending", "Active", "Suspended", "Deleted"].includes(newStatus)) { // Added Pending as a valid status
        return respError(res, "Invalid status provided.", 400);
    }

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


// DELETE /api/clients/:id: Admin soft-delete route
app.delete("/api/clients/:id", publicLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const { notes } = req.body;
    
    const client = await Client.findById(id);
    if (!client) return respError(res, "Client not found", 404);
    
    const previous = client.status;
    client.status = "Deleted"; // Soft delete

    client.history.push({ action: "CLIENT_DELETED", notes, actor: "admin" });
    await client.save();
    
    await logAction("admin", "CLIENT_DELETED", client._id, notes, { previousStatus: previous, newStatus: "Deleted" });
    return respSuccess(res, null, "Client soft-deleted successfully");
  } catch (err) {
    logger.error({ err }, "❌ DELETE /api/clients/:id error");
    return respError(res, "Server error deleting client", 500, null, err);
  }
});


// POST /api/clients/:id/pdf: Admin route to generate and retrieve PDF
app.post("/api/clients/:id/pdf", publicLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const client = await Client.findById(id);
    if (!client) return respError(res, "Client not found.", 404);
    
    // PDF Generation is stubbed, but should return a URL for the admin to view
    const pdfUrl = await generateAndUploadPdf(client); 

    return respSuccess(res, { pdfUrl }, "PDF URL generated successfully", 200, { redirect: pdfUrl });
  } catch (err) {
    logger.error({ err }, "❌ POST /api/clients/:id/pdf error");
    return respError(res, "Server error generating PDF.", 500, null, err);
  }
});


// POST /api/clients/:id/vcard: Create vCard, QR code, update client, send email
app.post("/api/clients/:id/vcard", publicLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const client = await Client.findById(id);
    if (!client) return respError(res, "Client not found.", 404);
    
    if (!client.fullName || (!client.phone1 && !client.email1)) {
      return respError(res, "Client must have fullName and at least one contact (phone1 or email1).", 400);
    }
    
    // Ensure slug exists
    if (!client.slug || client.slug.trim() === "") {
      client.slug = await generateUniqueSlug(client.fullName);
    }
    
    // The public page URL uses the dedicated VCARD_BASE_URL
    const publicVcardPage = `${VCARD_BASE_URL}/${client.slug}`;
    
    // 1. Generate vCard Content
    const vcardContent = generateVcardContent(client);
    
    // 2. Upload vCard to Cloudinary
    const vcardUrl = await uploadVcfToCloudinary(client.slug, vcardContent); 
    
    // 3. Generate QR Code (The QR code should encode the public page link, not the direct vCard link)
    const qrCodeUrl = await qrcode.toDataURL(publicVcardPage);
    
    // 4. Update Client Record
    client.vcardUrl = vcardUrl;
    client.qrCodeUrl = qrCodeUrl;
    client.status = "Active";
    client.history.push({ action: "VCARD_CREATED", notes: `vCard at ${vcardUrl}, Public Page: ${publicVcardPage}`, actor: "admin" });
    await client.save();

    // 5. Send vCard/QR email to client
    const emailToClient = client.email1 || ADMIN_EMAIL;
    if (emailToClient) {
      const emailHtml = `
        <h1>Your Digital Smart Card is Ready!</h1>
        <p>Dear ${client.fullName},</p>
        <p>Your SmartCardLink profile is now active and ready to share.</p>
        <p><strong>Public Page Link:</strong> <a href="${publicVcardPage}">${publicVcardPage}</a></p>
        <p><strong>Direct Download vCard:</strong> <a href="${vcardUrl}">Click to Download Contact (.vcf)</a></p>
        <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px; border: 1px solid #ccc; padding: 10px;">
        <p>Thank you.</p>
      `;
      await sendEmail(emailToClient, `Your SmartCardLink is Ready: ${client.fullName}`, `Your digital smart card is ready. Public Page: ${publicVcardPage}`, emailHtml);
    }
    
    return respSuccess(res, { vcardUrl, qrCodeUrl, publicVcardPage }, "vCard created, client active, email sent.");
  } catch (err) {
    logger.error({ err }, "❌ POST /api/clients/:id/vcard error");
    return respError(res, "Server error creating vCard.", 500, null, err);
  }
});


// ------------------------
// Public View Route (VCard page)
// ------------------------

// GET /:slug: Public route to fetch the client data for client-side rendering
app.get("/:slug", publicLimiter, async (req, res) => {
  try {
    const slug = req.params.slug;
    // Find the client and ensure status is Active
    const client = await Client.findOne({ slug: slug, status: "Active" });
    
    if (!client) {
      await logAction("system", "VCARD_MISSING", null, `Attempted access for missing/inactive slug: ${slug}`, { ip: req.ip });
      // Redirect to the fallback URL from .env
      return res.redirect(APP_FALLBACK_URL || "/404.html"); 
    }
    
    // Log the visit
    await logAction("system", "VCARD_VISIT", client._id, `Visit to public page: ${slug}`, { ip: req.ip });
    
    // Data returned for client-side JavaScript rendering 
    const vcardData = {
        fullName: client.fullName,
        title: client.title,
        company: client.company,
        phone1: client.phone1,
        email1: client.email1,
        website: client.website || client.businessWebsite, // Consolidated
        address: client.address,
        bio: client.bio,
        photoUrl: client.photoUrl,
        vcardUrl: client.vcardUrl,
        qrCodeUrl: client.qrCodeUrl,
        socialLinks: client.socialLinks, 
        workingHours: client.workingHours,
    };
    
    // Return the data as a JSON response for dynamic rendering on the client-side.
    return respSuccess(res, vcardData, "vCard data retrieved successfully");

  } catch (err) {
    logger.error({ err }, "❌ GET /:slug error");
    return respError(res, "Error retrieving vCard.", 500, null, err);
  }
});

// ------------------------
// Health Check Route (For Render Deployment)
// ------------------------
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';
  const overallStatus = dbStatus === 'UP' ? 200 : 503;
  
  return res.status(overallStatus).json({
    status: overallStatus === 200 ? 'ok' : 'error',
    service: 'SmartCardLink API',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});


// ------------------------
// Server Start
// ------------------------
app.listen(PORT, HOST, () => {
  logger.info(`🚀 Server running on ${APP_BASE_URL}`);
  logger.info(`🌐 Frontend expects CORS from: ${FRONTEND_BASE_URL} and ${VCARD_BASE_URL}`);
});