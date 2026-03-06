// C:\Users\ADMIN\Desktop\smartcardlink-app\server.js
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
const { body, validationResult } = require('express-validator'); 
require('dotenv').config(); // CRITICAL: Load .env variables


// Configure custom logger
const logger = pino({ level: process.env.NODE_ENV === "production" ? "info" : "debug" });


// ------------------------
// Environment Variables & Configuration
// ------------------------
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
const MONGO_URI = process.env.MONGODB_URI; 

// 1. The URL where THIS API is running (Backend)
const APP_BASE_URL = process.env.APP_BASE_URL || "https://smartcardlink-api.onrender.com"; 

// 2. The URL where your Dashboard/Admin UI is hosted (Frontend)
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://smartcardlink-dashboard-frontend.onrender.com"; 

// 3. The URL where the Public vCard pages are hosted (Public)
// CRITICAL: We use the dedicated public domain to ensure QR codes and links are authoritative.
const VCARD_BASE_URL = process.env.VCARD_BASE_URL || "https://smartcardlink-public.onrender.com";

// 4. Fallback URL for errors or inactive slugs
const APP_FALLBACK_URL = process.env.APP_FALLBACK_URL || `${VCARD_BASE_URL}/404.html`;

// Derive the origin for CORS logic
const BACKEND_API_URL = new URL(APP_BASE_URL).origin;


// SMTP
const SMTP_HOST = process.env.SMTP_HOST; 
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587; 
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || null; 


// Cloudinary
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;


// ------------------------
// Database Schema and Model
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
    photoUrl: { type: String, default: "" },
    themeColor: { type: String, default: "#FFD700" },
    themeName: { type: String, default: "modern" },
    themeName: { type: String, default: "modern" }, // Cloudinary URL
    slug: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["Pending", "Active", "Suspended", "Deleted"], default: "Pending" },

    vcardUrl: { type: String, default: "" }, // Cloudinary URL to .vcf file
    qrCodeUrl: { type: String, default: "" }, // Data URL for QR code

    history: [historySchema],
}, { timestamps: true });

// Model definition
const Client = mongoose.model("Client", ClientSchema);


// ------------------------
// App Initialization & DB Connection
// ------------------------
const app = express();
const staticPath = path.join(__dirname, "public");


// MongoDB Connection: Uses MONGODB_URI
mongoose
    .connect(MONGO_URI)
    .then(() => logger.info(" MongoDB connected successfully"))
    .catch((err) => {
        logger.error({ err }, " MongoDB connection error. Check MONGODB_URI.");
        process.exit(1);
    });


// Cloudinary Configuration: Uses CLOUDINARY_... variables
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


// Email Transporter: Uses SMTP_... variables
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
// Helper Functions
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


// Logging (Pino only)
const logAction = async (actor, action, clientId, notes, data) => {
    logger.info({ actor, action, clientId, notes, data }, `ACTION: ${action} by ${actor}`);
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
    // FIX: Check uniqueness across all statuses and use suffixes for collisions
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
    // FIX: Process social links safely to prevent errors on missing fields
    if (client.socialLinks) {
        const socialData = client.socialLinks.toObject ? client.socialLinks.toObject() : client.socialLinks;
        const socialText = Object.entries(socialData)
            .filter(([_, url]) => url && typeof url === 'string')
            .map(([platform, url]) => `${platform}: ${url}`)
            .join('\n');
        if (socialText) vCard.socialmedia = socialText;
    }
    
    // FIX: Only attach photo if a valid URL exists
    if (client.photoUrl && client.photoUrl.startsWith('http')) {
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
            public_id: `${slug}_vcard`, 
            format: "vcf",
            tags: ["client_vcard"],
            overwrite: true
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
        logger.error({ err }, ` Failed to send email to ${to}`);
    }
};


// PDF Stub 
const generateAndUploadPdf = async (client) => {
    logger.warn(`PDF generation is a complex feature and is currently stubbed (generateAndUploadPdf).`);
    // FIX: Standardized return of Cloudinary PDF URL
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/smartcardlink_pdfs/${client.slug}.pdf`;
};


// ------------------------
// Middleware
// ------------------------
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// CRITICAL FIX: Trust the proxy (Render) for rate-limiting
app.set('trust proxy', 1);


// Security Middleware (Helmet)
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrcElem: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            // CRITICAL FIX: Ensure all necessary image sources are included.
            imgSrc: ["'self'", "data:", "res.cloudinary.com", "https://res.cloudinary.com"], 
            // CRITICAL: Updated connectSrc to include all necessary domains from .env
            connectSrc: [
                "'self'", 
                BACKEND_API_URL, 
                new URL(FRONTEND_BASE_URL).origin, // Added to ensure fetch requests work
                new URL(VCARD_BASE_URL).origin,  // Added for public vCard access
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
// PRODUCTION FIX: Conditionally allow origins. No localhost in production.
app.use(
    cors({
        origin: (origin, callback) => {
            const isProduction = process.env.NODE_ENV === "production";
            
            // Define production origins from .env, extracting the origin part (protocol + host)
            const productionOrigins = [
                BACKEND_API_URL, 
                new URL(FRONTEND_BASE_URL).origin,
                new URL(VCARD_BASE_URL).origin,
            ];


            // Define development origins
            const devOrigins = [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                /http:\/\/localhost:\d+$/, // dynamic local ports
            ];


            // Determine the final allowed list
            const allowedOrigins = isProduction ? productionOrigins : [...productionOrigins, ...devOrigins];
            
            if (!origin) return callback(null, true); // Allow server-to-server or requests without an Origin header


            // Check against normalized or raw origin
            const normalizedOrigin = origin.includes('://') ? new URL(origin).origin : origin; 
            
            if (allowedOrigins.includes(origin) || allowedOrigins.includes(normalizedOrigin) || allowedOrigins.some(regex => regex instanceof RegExp && regex.test(origin))) {
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
// Validation Middleware Collections
// ------------------------


// Validation rules for Client creation (POST)
const validateClientCreation = [
    body('fullName').trim().isLength({ min: 1, max: 100 }).withMessage('Full Name is required and must be under 100 characters.'),
    body('email1').isEmail().optional({ checkFalsy: true }).withMessage('Primary Email (email1) must be a valid email address.'),
];


// Validation rules for Client update (PUT)
const validateClientUpdate = [
    // All fields are optional but must pass validation if present
    body('fullName').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Full Name must be under 100 characters.'),
    body('email1').optional({ checkFalsy: true }).isEmail().withMessage('Primary Email (email1) must be a valid email address.'),
    body('email2').optional({ checkFalsy: true }).isEmail().withMessage('Secondary Email (email2) must be a valid email address.'),
    body('email3').optional({ checkFalsy: true }).isEmail().withMessage('Tertiary Email (email3) must be a valid email address.'),
    body('status').optional().isIn(["Pending", "Active", "Suspended", "Deleted"]).withMessage('Invalid client status value.'),
];


// Reusable middleware to handle validation results
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Use 400 Bad Request for validation failures
        return respError(res, "Validation Failed.", 400, errors.array());
    }
    next();
};


// ------------------------
// Public View Route (VCard page)
// ------------------------// Serve all static files from /public
 // ------------------------
 // Public VCard JSON API
 // ------------------------
 app.get("/api/vcard/:slug", publicLimiter, async (req, res) => {
     try {
         const slug = req.params.slug;

         const client = await Client.findOne({ slug, status: "Active" });
         if (!client) {
             await logAction("system", "VCARD_MISSING", null, `Missing or inactive slug: ${slug}`, { ip: req.ip });
             return respError(res, "vCard not found or inactive.", 404);
         }

         await logAction("system", "VCARD_VISIT", client._id, `Public vCard viewed: ${slug}`, { ip: req.ip });

         return respSuccess(res, {
             fullName: client.fullName,
             title: client.title,
             company: client.company,
             phone1: client.phone1,
             phone2: client.phone2,
             phone3: client.phone3,
             email1: client.email1,
             email2: client.email2,
             email3: client.email3,
             website: client.website || client.businessWebsite,
             portfolioWebsite: client.portfolioWebsite,
             locationMap: client.locationMap,
             address: client.address,
             bio: client.bio,
             photoUrl: client.photoUrl,
             vcardUrl: client.vcardUrl,
             qrCodeUrl: client.qrCodeUrl,
             socialLinks: client.socialLinks,
             workingHours: client.workingHours
         }, "vCard data retrieved successfully");

     } catch (err) {
         logger.error({ err }, "? GET /api/vcard/:slug error");
         return respError(res, "Failed to load vCard.", 500, null, err);
     }
 });

 app.use(express.static(staticPath, { index: false, extensions: false }));

// Favicon check
app.get("/favicon.ico", (req, res) => {
    const icoPath = path.join(staticPath, "favicon.ico");
    if (fs.existsSync(icoPath)) return res.sendFile(icoPath);
    return res.status(204).end();
});

// SPA fallback
app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticPath, "index.html"));
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
        
        // Return a simplified JSON response for frontend consumption
        return respSuccess(res, { photoUrl: result.secure_url }, "Photo uploaded successfully");
    } catch (err) {
        logger.error({ err }, " POST /api/upload-photo error");
        return respError(res, "Upload error", 500, null, err);
    }
});


// POST /api/clients: Create a new client record (initial form submission)
app.post("/api/clients", publicLimiter, validateClientCreation, handleValidationErrors, async (req, res) => {
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
        
        // Notify admin by email (Uses ADMIN_EMAIL and SMTP details)
        if (ADMIN_EMAIL) {
            const subject = `New SmartCardLink submission: ${clientDoc.fullName}`;
            const text = `New client submitted. ID: ${clientDoc._id}  ${clientDoc.fullName}. Check admin panel to process.`;
            await sendEmail(ADMIN_EMAIL, subject, text);
        }
        
        return respSuccess(res, { recordId: clientDoc._id }, "Saved. Pending admin processing.", 201);
    } catch (err) {
        if (err.name === 'ValidationError') {
            return respError(res, `Validation Error: ${err.message}`, 400, null, err);
        }
        logger.error({ err }, " POST /api/clients error");
        return respError(res, err?.message || "Server error", 500, null, err);
    }
});


// GET /api/clients/all (Missing route to fetch all clients for dashboard)
// NOTE: Security Warning - This route is unauthenticated as requested.
app.get("/api/clients/all", publicLimiter, async (req, res) => {
    try {
        const clients = await Client.find({})
            .sort({ createdAt: -1 }) // Sort by newest first
            .select("-history -__v"); // Exclude large/internal fields


        return respSuccess(res, clients, "All clients retrieved successfully");
    } catch (err) {
        logger.error({ err }, " GET /api/clients/all error");
        return respError(res, "Server error fetching all clients", 500, null, err);
    }
});


// GET /api/admin/clients: Admin listing with filtering and pagination
// NOTE: Security Warning - This route is unauthenticated as requested.
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
        logger.error({ err }, " GET /api/admin/clients error");
        return respError(res, "Server error fetching clients", 500, null, err);
    }
});


// GET /api/clients/:id: Helper for Admin Panel to fetch one client
// NOTE: Security Warning - This route is unauthenticated as requested.
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
app.put("/api/clients/:id", publicLimiter, async (req, res) => {
    try {
        const id = req.params.id;
        const incoming = req.body;
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found", 404);

        // Update Pro Theme & Base Fields
        if (incoming.photoUrl) client.photoUrl = incoming.photoUrl;
        if (incoming.themeColor) client.themeColor = incoming.themeColor;
        if (incoming.themeName) client.themeName = incoming.themeName;

        const allowedFields = ['fullName','title','company','businessWebsite','portfolioWebsite','locationMap','phone1','phone2','phone3','email1','email2','email3','address','bio','status'];
        allowedFields.forEach(f => { if(incoming[f] !== undefined) client[f] = incoming[f]; });

        if (incoming.socialLinks) Object.assign(client.socialLinks, incoming.socialLinks);
        if (incoming.workingHours) Object.assign(client.workingHours, incoming.workingHours);

        client.history.push({
            action: "CLIENT_UPDATED",
            notes: "Admin updated client profile and Pro themes.",
            actor: "admin",
            time: new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })
        });

        await client.save();
        return respSuccess(res, { recordId: client._id }, "Client updated successfully.");
    } catch (err) {
        return respError(res, "Update failed", 500, null, err);
    }
});

// ----------------------
// STATUS ROUTE
// ----------------------app.put("/api/clients/:id/status/:newStatus", publicLimiter, async (req, res) => {
    try {
        const id = req.params.id;
        const newStatus = req.params.newStatus; 
        const { notes } = req.body; 
        
        const dbStatus = newStatus === 'Disabled' ? 'Suspended' : newStatus; 

        if (!['Active', 'Suspended', 'Pending', 'Deleted'].includes(dbStatus)) {
            return respError(res, "Invalid status requested.", 400);
        }
        
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found.", 404);

        if (client.status === dbStatus) {
             return respSuccess(res, { recordId: client._id, newStatus: dbStatus }, `Client already in status ${dbStatus}.`, 200);
        }
        
        client.status = dbStatus;
        client.history.push({ 
            action: `STATUS_CHANGED_TO_${dbStatus.toUpperCase()}`, 
            notes: notes || `Status changed to ${dbStatus}.`, 
            actor: "admin" 
        });

        await client.save();
        
        return respSuccess(res, { recordId: client._id, newStatus: client.status }, `Client status updated to ${newStatus}.`);
    } catch (err) {
        logger.error({ err }, " PUT /api/clients/:id/status/:newStatus error");
        return respError(res, err?.message || "Server error updating status", 500, null, err);
    }
});


// DELETE /api/clients/:id: Admin soft-delete route
// NOTE: Security Warning - This route is unauthenticated as requested.
app.delete("/api/clients/:id", publicLimiter, async (req, res) => {
    try {
        const id = req.params.id;
        const { notes } = req.body;
        
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found", 404);
        
        const previous = client.status;
        client.status = "Deleted"; 
        // Soft delete


        client.history.push({ action: "CLIENT_DELETED", notes, actor: "admin" });
        await client.save();
        
        await logAction("admin", "CLIENT_DELETED", client._id, notes, { previousStatus: previous, newStatus: "Deleted" });
        return respSuccess(res, null, "Client soft-deleted successfully");
    } catch (err) {
        logger.error({ err }, " DELETE /api/clients/:id error");
        return respError(res, "Server error deleting client", 500, null, err);
    }
});


// POST /api/clients/:id/pdf: Admin route to generate and retrieve PDF
// NOTE: Security Warning - This route is unauthenticated as requested.
app.post("/api/clients/:id/pdf", publicLimiter, async (req, res) => {
    try {
        const id = req.params.id;
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found.", 404);
        
        // PDF Generation is stubbed, but should return a URL for the admin to view
        const pdfUrl = await generateAndUploadPdf(client); 
        
        // Log the PDF generation
        client.history.push({ action: "PDF_GENERATED", notes: `PDF link created: ${pdfUrl}`, actor: "admin" });
        await client.save();


        return respSuccess(res, { pdfUrl }, "PDF URL generated successfully", 200, { redirect: pdfUrl });
    } catch (err) {
        logger.error({ err }, " POST /api/clients/:id/pdf error");
        return respError(res, "Server error generating PDF.", 500, null, err);
    }
});


// POST /api/clients/:id/vcard: Create vCard, QR code, update client, send email
// NOTE: Security Warning - This route is unauthenticated as requested.
app.post("/api/clients/:id/vcard", publicLimiter, async (req, res) => {
    try {
        const id = req.params.id;
        const client = await Client.findById(id);


        if (!client) return respError(res, "Client not found.", 404);
        if (!client.email1) return respError(res, "Cannot generate vCard: Client has no primary email address (email1).", 400);


// 1. Generate vCard Content
        const vcfContent = generateVcardContent(client);
      
        // 2. Upload VCF to Cloudinary
        const vcfDownloadUrl = await uploadVcfToCloudinary(client.slug, vcfContent);
        
        // 3. Prepare public page link and Generate QR Code
        // FIX: Changed from path-based (/slug) to query-based (?slug=) to match frontend logic
        const publicVcardPage = `${VCARD_BASE_URL.replace(/\/$/, "")}/?slug=${client.slug}`;
        const qrCodeDataUrl = await qrcode.toDataURL(publicVcardPage, { errorCorrectionLevel: "H", type: "image/png" }); 

        // 4. Update DB
        // FIX: Store the public webpage URL in vcardUrl instead of the Cloudinary file link
        client.vcardUrl = publicVcardPage; 
        client.qrCodeUrl = qrCodeDataUrl; 
        client.status = "Active";
        client.history.push({ 
            action: "VCARD_GENERATED", 
            notes: `vCard generated, status set to Active. Webpage: ${publicVcardPage}`,
            actor: "admin"
        });
        await client.save();

// 5. Send Client Email (Uses SMTP details)
        const emailSubject = `Your SmartCardLink is Ready!`;
        const emailHtml = `
            <p>Dear ${client.fullName},</p>
            <p>Your digital smart card is now <strong>Active</strong> and ready to share.</p>
            <p><strong>Public Page Link:</strong> <a href="${publicVcardPage}">${publicVcardPage}</a></p>
            <p>Thank you.</p>
        `;
        await sendEmail(client.email1, emailSubject, `Your digital smart card link is: ${publicVcardPage}`, emailHtml);

        //  REQUIRED SERVER RESPONSE CONTRACT (CORRECTED)
        // Returning email1 and slug allows the Action Bar buttons to work immediately.
        return respSuccess(res, { 
            vcardUrl: publicVcardPage, 
            qrCodeUrl: qrCodeDataUrl, 
            publicVcardPage,
            email1: client.email1,
            slug: client.slug 
        }, "vCard created, client active, email sent.", 200);
    } catch (err) {
        logger.error({ err }, " POST /api/clients/:id/vcard error");
        return respError(res, err?.message || "vCard generation failed.", 500, null, err);
    }
})

// ------------------------
// Public View Route (VCard page)
// ------------------------


// GET /:slug: Public route to fetch the client data for client-side rendering
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


// Use RENDER_EXTERNAL_URL (provided by Render) if available, otherwise fall back to APP_BASE_URL
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || APP_BASE_URL;
const ALLOWED_ORIGINS_LOG = [
    new URL(FRONTEND_BASE_URL).origin,
    new URL(VCARD_BASE_URL).origin
].join(' and ');


app.listen(PORT, HOST, () => {
    // Logs the live URL from your environment settings
    logger.info(` Server live and listening on ${PUBLIC_URL}`); 
    logger.info(` Frontend expects CORS from: ${ALLOWED_ORIGINS_LOG}`);
});





