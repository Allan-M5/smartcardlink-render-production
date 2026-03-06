const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const clientSchema = new mongoose.Schema({
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    title: { type: String, default: "" },
    company: { type: String, default: "" },
    phone1: { type: String, default: "" },
    phone2: { type: String, default: "" },
    email1: { type: String, trim: true, lowercase: true, default: "" },
    email2: { type: String, trim: true, lowercase: true, default: "" },
    email3: { type: String, trim: true, lowercase: true, default: "" },
    appointmentUrl: { type: String, default: "" },
    address: { type: String, default: "" },
    website: { type: String, default: "" },
    bio: { type: String, default: "" },
    photoUrl: { type: String, default: "" },
    socialLinks: {
        facebook: { type: String, default: "" },
        twitter: { type: String, default: "" },
        instagram: { type: String, default: "" },
        linkedin: { type: String, default: "" },
        whatsapp: { type: String, default: "" }
    },
    status: { type: String, default: 'Active' }
}, { timestamps: true });

const Client = mongoose.model('Client', clientSchema);

app.get('/api/vcard/:slug', async (req, res) => {
    try {
        const client = await Client.findOne({ slug: req.params.slug, status: 'Active' });
        if (!client) return res.status(404).json({ error: 'Not found' });
        if (client.photoUrl && client.photoUrl.includes('cloudinary')) {
            client.photoUrl = client.photoUrl.replace('/upload/', '/upload/f_auto,q_auto/');
        }
        res.json({ data: client });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clients/:id', async (req, res) => {
    try {
        const incoming = req.body;
        const allowed = ['name', 'title', 'company', 'phone1', 'phone2', 'email1', 'email2', 'email3', 'address', 'website', 'bio', 'status', 'appointmentUrl', 'socialLinks'];
        const updateData = {};
        allowed.forEach(field => {
            if (incoming[field] !== undefined) updateData[field] = incoming[field];
        });
        const updatedClient = await Client.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        res.json({ success: true, data: updatedClient });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// FIX: Point to public/index.html
app.get('/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
// Client Schema & Model
const clientSchema = new mongoose.Schema({
    fullName: String, title: String, company: String,
    phone1: String, phone2: String, phone3: String,
    email1: String, email2: String, email3: String,
    businessWebsite: String, portfolioWebsite: String,
    locationMap: String, bio: String, address: String,
    socialLinks: { type: Map, of: String },
    workingHours: { type: Map, of: String },
    appointmentUrl: String, themeColor: String
}, { timestamps: true });

const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);

// Handle POST to /api/clients
app.post("/api/clients", async (req, res) => {
    try {
        const newClient = new Client(req.body);
        const saved = await newClient.save();
        res.status(201).json({ status: "success", data: saved });
    } catch (err) {
        console.error("Save Error:", err);
        res.status(400).json({ status: "error", message: err.message });
    }
});

// Client Schema & Model
const clientSchema = new mongoose.Schema({
    fullName: String, title: String, company: String,
    phone1: String, phone2: String, phone3: String,
    email1: String, email2: String, email3: String,
    businessWebsite: String, portfolioWebsite: String,
    locationMap: String, bio: String, address: String,
    socialLinks: { type: Map, of: String },
    workingHours: { type: Map, of: String },
    appointmentUrl: String, themeColor: String
}, { timestamps: true });

const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);

// Handle POST to /api/clients
app.post("/api/clients", async (req, res) => {
    try {
        const newClient = new Client(req.body);
        const saved = await newClient.save();
        res.status(201).json({ status: "success", data: saved });
    } catch (err) {
        console.error("Save Error:", err);
        res.status(400).json({ status: "error", message: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));



