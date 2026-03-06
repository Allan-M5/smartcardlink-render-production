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


// Handle POST to /api/clients
app.post("/api/clients", async (req, res) => {
    try {
        const newClient = new Client({
            ...req.body,
            status: "Pending",
            history: [{
                action: "CLIENT_CREATED",
                notes: "Initial form submission",
                actor: "client_submission",
                timestamp: new Date()
            }]
        });
        const saved = await newClient.save();
        res.status(201).json({ status: "success", data: saved });
    } catch (err) {
        console.error("Save Error:", err);
        res.status(400).json({ status: "error", message: err.message });
    }
});

// Client Schema & Model


// Handle POST to /api/clients
app.post("/api/clients", async (req, res) => {
    try {
        const newClient = new Client({
            ...req.body,
            status: "Pending",
            history: [{
                action: "CLIENT_CREATED",
                notes: "Initial form submission",
                actor: "client_submission",
                timestamp: new Date()
            }]
        });
        const saved = await newClient.save();
        res.status(201).json({ status: "success", data: saved });
    } catch (err) {
        console.error("Save Error:", err);
        res.status(400).json({ status: "error", message: err.message });
    }
});

// --- Unified Client Model & Route ---
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

app.post("/api/clients", async (req, res) => {
    try {
        const newClient = new Client({
            ...req.body,
            status: "Pending",
            history: [{
                action: "CLIENT_CREATED",
                notes: "Initial form submission",
                actor: "client_submission",
                timestamp: new Date()
            }]
        });
        const saved = await newClient.save();
        res.status(201).json({ status: "success", data: saved });
    } catch (err) {
        res.status(400).json({ status: "error", message: err.message });
    }
});
// --- End Unified ---

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));









// GET all clients for the Admin Dashboard (supports status filtering)
app.get('/api/admin/clients', async (req, res) => {
    try {
        const { status, q } = req.query;
        let query = {};
        if (status) query.status = status;
        if (q) query.fullName = { $regex: q, $options: 'i' };

        const clients = await Client.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: clients });
    } catch (error) {
        console.error("Error fetching admin clients:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// GET a single client by ID (for auto-populate)
app.get('/api/clients/:id', async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Client not found" });
        res.json({ success: true, data: client });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
