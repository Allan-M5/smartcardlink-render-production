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

const logger = pino({ level: "info", base: { pid: false }, timestamp: pino.stdTimeFunctions.isoTime });
const app = express();
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGODB_URI;
const VCARD_BASE_URL = process.env.VCARD_BASE_URL || "https://smartcardlink-public.onrender.com";

// --- Schema ---
const ClientSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    title: String, company: String, phone1: String, email1: String,
    vcardUrl: String, qrCodeUrl: String,
    status: { type: String, enum: ["Pending", "Processed", "Active", "Suspended", "Deleted"], default: "Pending" },
    history: [{ action: String, notes: String, actor: String, timestamp: { type: Date, default: Date.now } }]
}, { timestamps: true });
const Client = mongoose.model("Client", ClientSchema);

// --- Middleware & Database ---
app.use(helmet());
app.use(cors());
app.use(express.json());
mongoose.connect(MONGO_URI).then(() => logger.info("? DB Connected"));

// --- Helpers ---
const respSuccess = (res, data, message) => res.json({ status: "success", message, data });
const respError = (res, message, code = 500) => res.status(code).json({ status: "error", message });

const generateVcardContent = (c) => {
    const v = vCardJS();
    v.firstName = c.fullName;
    v.organization = c.company;
    v.workPhone = c.phone1;
    v.email = c.email1;
    return v.getFormattedString();
};

const uploadVcfToCloudinary = async (slug, content) => {
    const res = await cloudinary.uploader.upload(`data:text/vcard;base64,${Buffer.from(content).toString('base64')}`, {
        folder: "vcards", resource_type: "raw", public_id: `${slug}_vcard`, format: "vcf", overwrite: true
    });
    return res.secure_url;
};

// --- Endpoints ---
app.get("/api/clients/:id", async (req, res) => {
    const client = await Client.findById().lean()(req.params.id);
    client ? respSuccess(res, client) : respError(res, "Not found", 404);
});

app.post("/api/clients/:id/vcard", async (req, res) => {
    try {
        const client = await Client.findById().lean()(req.params.id);
        if (!client || !client.email1) return respError(res, "Client or email missing", 400);

        const vcf = generateVcardContent(client);
        const vcardUrl = await uploadVcfToCloudinary(client.slug, vcf);
        const publicUrl = `${VCARD_BASE_URL}/?slug=${client.slug}`;
        const qrCodeData = await qrcode.toDataURL(publicUrl);

        client.vcardUrl = vcardUrl;
        client.qrCodeUrl = qrCodeData;
        client.status = "Active";
        client.history.push({ action: "DEPLOYMENT", notes: `Live: ${publicUrl}`, actor: "admin" });

        await client.save();
        return respSuccess(res, { publicUrl, vcardUrl, qrCodeUrl: qrCodeData }, "Deployed.");
    } catch (err) {
        logger.error(err);
        return respError(res, "Deployment failed.");
    }
});


// SMARTCARDLINK PHOTO UPLOAD
const storage = multer.memoryStorage();
const upload = multer({ storage });


app.listen(PORT, "0.0.0.0", () => logger.info(`?? Server on ${PORT}`));






