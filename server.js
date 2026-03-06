/**
 * SmartCardLink - Master Server Controller
 * Version: 2.2.0 - Production Ready (Fixed Async Syntax & Route Merging)
 */

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
require('dotenv').config(); 

const app = express();
const logger = pino({ level: "info" });
// --- CONFIGURATION FROM ENV ---
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGODB_URI;
const VCARD_BASE_URL = process.env.VCARD_BASE_URL || "https://smartcardlink-public.onrender.com";

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// SMTP Configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// --- DB SCHEMAS ---
const historySchema = new mongoose.Schema({
    action: String,
    notes: String,
    actor: { type: String, default: "system" },
    timestamp: { type: Date, default: Date.now }
});

const ClientSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    title: String,
    slug: { type: String, unique: true, sparse: true },
    phone1: String, phone2: String, phone3: String,
    email1: String, email2: String, email3: String,
    company: String, businessWebsite: String, portfolioWebsite: String,
    address: String, bio: String, themeName: String,
    status: { type: String, default: "Pending" },
    vcardUrl: String, qrCodeUrl: String,
    history: [historySchema]
}, { timestamps: true });

const Client = mongoose.model("Client", ClientSchema);

// --- MIDDLEWARE ---
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// --- ROUTES ---

// 1. GOLDEN POST ROUTE (Enforces Status & History)
app.post("/api/clients", async (req, res) => {
    try {
        const clientData = {
            ...req.body,
            status: 'Pending',
            history: [{
                action: 'CLIENT_CREATED',
                notes: 'Initial form submission',
                actor: 'client_submission',
                timestamp: new Date()
            }]
        };
        const newClient = new Client(clientData);
        const saved = await newClient.save();
        res.status(201).json({ success: true, data: saved });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// 2. ADMIN LISTING (Includes Pending Fix)
app.get("/api/admin/clients", async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status === 'Pending') {
            query.status = { $in: ['Pending', null, undefined] };
        } else if (status) {
            query.status = status;
        }
        const clients = await Client.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: clients });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. SINGLE CLIENT & UPDATE
app.get("/api/clients/:id", async (req, res) => {
    const client = await Client.findById(req.params.id);
    res.json({ success: true, data: client });
});

app.put("/api/clients/:id", async (req, res) => {
    try {
        const updated = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. VCARD GENERATION (Logic for Theme)
app.post("/api/clients/:id/vcard", async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        const slug = client.slug || client.fullName.toLowerCase().replace(/ /g, '-');
        const publicUrl = `${VCARD_BASE_URL}/?slug=${slug}`;
        const qr = await qrcode.toDataURL(publicUrl);
        
        client.vcardUrl = publicUrl;
        client.qrCodeUrl = qr;
        client.status = "Active";
        await client.save();
        
        res.json({ success: true, vcardUrl: publicUrl });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- STARTUP ---
mongoose.connect(MONGO_URI).then(() => {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
});

// ASSETS: Photo Upload to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });
app.post("/api/upload-photo", upload.single("photo"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file provided" });
        const b64 = Buffer.from(req.file.buffer).toString("base64");
        const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
        const result = await cloudinary.uploader.upload(dataURI, { folder: "smartcardlink_photos" });
        res.json({ success: true, photoUrl: result.secure_url });
    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ADMIN: Change Client Status (Fixed for your Dashboard PUT request)
app.put("/api/clients/:id/status/:newStatus", async (req, res) => {
    try {
        const { id, newStatus } = req.params;
        const client = await Client.findByIdAndUpdate(
            id, 
            { status: newStatus }, 
            { new: true }
        );
        if (!client) return res.status(404).json({ success: false, message: "Client not found" });
        res.json({ success: true, data: client });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


