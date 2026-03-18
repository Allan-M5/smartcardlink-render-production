const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const RateLimit = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const qrcode = require('qrcode');
const vCardJS = require('vcards-js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pino = require('pino');
const pinoHttp = require('pino-http');
require('dotenv').config();

const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    base: { pid: false },
    timestamp: pino.stdTimeFunctions.isoTime,
});

const app = express();

const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';
const MONGO_URI = process.env.MONGODB_URI;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://smartcardlink-api.onrender.com';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://smartcardlink-dashboard-frontend.onrender.com';
const VCARD_BASE_URL = process.env.VCARD_BASE_URL || 'https://smartcardlink-public.onrender.com';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || '';
const PAYMENT_POCHI_NUMBER = String(process.env.PAYMENT_POCHI_NUMBER || '0702444552').trim();
const PACKAGE_PRICES = {
    standard: 1500,
    pro: 2500,
};

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

const staticPath = path.join(__dirname, 'public');
const rootStaticFiles = {
    '/client-form.html': path.join(__dirname, 'client-form.html'),
    '/admin-form.html': path.join(__dirname, 'admin-form.html'),
};

const historySchema = new mongoose.Schema({
    action: { type: String, required: true },
    notes: { type: String, default: '' },
    actor: { type: String, default: 'system' },
    timestamp: { type: Date, default: Date.now },
}, { _id: false });

const socialLinksSchema = new mongoose.Schema({
    facebook: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    twitter: { type: String, trim: true, default: '' },
    linkedin: { type: String, trim: true, default: '' },
    tiktok: { type: String, trim: true, default: '' },
    youtube: { type: String, trim: true, default: '' },
}, { _id: false });

const workingHoursSchema = new mongoose.Schema({
    monFriStart: { type: String, default: '' },
    monFriEnd: { type: String, default: '' },
    satStart: { type: String, default: '' },
    satEnd: { type: String, default: '' },
    sunStart: { type: String, default: '' },
    sunEnd: { type: String, default: '' },
}, { _id: false });

const resumeSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    fileUrl: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    passwordHash: { type: String, trim: true, default: '' },
    passwordLastGeneratedAt: { type: Date, default: null },
}, { _id: false });

const analyticsSchema = new mongoose.Schema({
    profileViews: { type: Number, default: 0 },
    resumeViews: { type: Number, default: 0 },
    resumeDownloads: { type: Number, default: 0 },
}, { _id: false });

const ClientSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: '' },
    slug: { type: String, required: true, unique: true, index: true },

    phone1: { type: String, trim: true, default: '' },
    phone2: { type: String, trim: true, default: '' },
    phone3: { type: String, trim: true, default: '' },

    email1: { type: String, trim: true, lowercase: true, default: '' },
    email2: { type: String, trim: true, lowercase: true, default: '' },
    email3: { type: String, trim: true, lowercase: true, default: '' },

    company: { type: String, trim: true, default: '' },
    businessWebsite: { type: String, trim: true, default: '' },
    portfolioWebsite: { type: String, trim: true, default: '' },
    locationMap: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },

    photoUrl: { type: String, trim: true, default: '' },
    appointmentUrl: { type: String, trim: true, default: '' },

    themeColor: { type: String, default: '#FFD700' },
    packageType: { type: String, enum: ['standard', 'pro'], default: 'standard' },
    themeName: { type: String, default: 'Default Gold' },

    status: {
        type: String,
        enum: ['Pending', 'Processed', 'Active', 'Disabled', 'Suspended', 'Deleted'],
        default: 'Pending',
    },

    vcardAssetUrl: { type: String, default: '' },
    vcardUrl: { type: String, default: '' },
    qrCodeUrl: { type: String, default: '' },
    vcardCreatedDate: { type: Date, default: null },
    subscriptionLastPaidDate: { type: Date, default: null },
    subscriptionRenewalNote: { type: String, trim: true, default: '' },

    resume: { type: resumeSchema, default: () => ({}) },
    analytics: { type: analyticsSchema, default: () => ({}) },

    socialLinks: { type: socialLinksSchema, default: () => ({}) },
    workingHours: { type: workingHoursSchema, default: () => ({}) },
    history: { type: [historySchema], default: [] },
}, { timestamps: true });

const Client = mongoose.models.Client || mongoose.model('Client', ClientSchema);

const sanitizeUrl = (value) => {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
        return trimmed;
    }
    return 'https://' + trimmed.replace(/^\/+/, '');
};

const ensureColor = (value) => {
    const color = String(value || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : '#FFD700';
};

const normalizeStatus = (value) => {
    const map = {
        pending: 'Pending',
        processed: 'Processed',
        active: 'Active',
        disabled: 'Suspended',
        suspended: 'Suspended',
        deleted: 'Deleted',
    };
    const key = String(value || '').trim().toLowerCase();
    return map[key] || 'Pending';
};

const slugifyName = (value) => {
    const slug = String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/[\s-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug || 'client';
};

const generateUniqueSlug = async (name, excludeId) => {
    const base = slugifyName(name);
    let candidate = base;
    let counter = 1;

    while (true) {
        const existing = await Client.findOne({
            slug: candidate,
            ...(excludeId ? { _id: { $ne: excludeId } } : {}),
        }).select('_id').lean();

        if (!existing) return candidate;

        candidate = base + '-' + counter;
        counter += 1;
    }
};

const buildAppointmentUrl = (email, overrideValue) => {
    const custom = String(overrideValue || '').trim();
    if (custom) {
        if (/^mailto:/i.test(custom) || /^https?:\/\//i.test(custom)) {
            return custom;
        }
        return sanitizeUrl(custom);
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return '';

    const subject = encodeURIComponent('Appointment Booking Request');
    const body = encodeURIComponent('Hello, I would like to book an appointment regarding your SmartCardLink profile.');
    return 'mailto:' + cleanEmail + '?subject=' + subject + '&body=' + body;
};

const generateFourDigitPassword = () => String(Math.floor(1000 + Math.random() * 9000));

const hashSecret = (value) => {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
};

const verifySecret = (plainValue, hashedValue) => {
    if (!plainValue || !hashedValue) return false;
    return hashSecret(plainValue) === String(hashedValue);
};

const isValidHttpUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
        return false;
    }
};

const getSlugFromUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        return String(parsed.searchParams.get('slug') || '').trim();
    } catch (error) {
        return '';
    }
};

const ensureResumeDefaults = (client) => {
    if (!client.resume || typeof client.resume !== 'object') {
        client.resume = {
            enabled: false,
            fileUrl: '',
            fileName: '',
            passwordHash: '',
            passwordLastGeneratedAt: null,
        };
    }

    if (!client.analytics || typeof client.analytics !== 'object') {
        client.analytics = {
            profileViews: 0,
            resumeViews: 0,
            resumeDownloads: 0,
        };
    }
};

const incrementClientAnalytics = async (clientId, fieldName) => {
    if (!clientId || !fieldName) return;
    try {
        await Client.updateOne(
            { _id: clientId },
            { $inc: { [`analytics.${fieldName}`]: 1 } }
        );
    } catch (error) {
        logger.error({ err: error, clientId, fieldName }, 'Analytics increment failed');
    }
};

const uploadResumePdfToCloudinary = async (slug, file) => {
    if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
        throw new Error('Cloudinary is not configured.');
    }

    const originalName = String(file.originalname || 'resume.pdf').trim() || 'resume.pdf';
    const safeBaseName = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]+/g, '-').toLowerCase() || 'resume';

    const result = await cloudinary.uploader.upload(
        'data:' + file.mimetype + ';base64,' + file.buffer.toString('base64'),
        {
            folder: 'smartcardlink_resumes',
            resource_type: 'raw',
            public_id: `${slug}_${safeBaseName}`,
            format: 'pdf',
            overwrite: true,
        }
    );

    return {
        fileUrl: result.secure_url,
        fileName: originalName.endsWith('.pdf') ? originalName : (originalName + '.pdf'),
    };
};

const buildClientDeliveryEmail = (client, options = {}) => {
    const safeClient = client || {};
    const packageType = String(safeClient.packageType || 'standard').toLowerCase();
    const isPro = packageType === 'pro';

    const vcardUrl = safeClient.vcardUrl || '';
    const cvPassword = options.cvPassword || '';
    const analyticsAccessToken = safeClient.vcardUrl || '';

    const subject = 'Your SmartCardLink vCard is Ready';

    const lines = [
        `Hello ${safeClient.fullName || 'Client'},`,
        '',
        'Thank you for choosing SmartCardLink services.',
        '',
        'Your live vCard URL:',
        vcardUrl || 'Not available',
        '',
    ];

    if (isPro) {
        lines.push(
            'Your PRO access details:',
            `CV Password: ${cvPassword || 'Not available'}`,
            `Analytics Access Token: ${analyticsAccessToken || 'Not available'}`,
            '',
            'Use the CV password to control who can view or download your resume.',
            'Use your exact vCard URL as the analytics access token when prompted inside your profile.',
            ''
        );
    } else {
        lines.push(
            'Upgrade to PRO vCard to unlock premium tools such as:',
            '- Custom theme color',
            '- Professional Resume section',
            '- Resume protection with access password',
            '- Profile analytics',
            '- Smart contact reminder tools',
            '',
            'PRO gives your profile stronger presentation and better control.',
            ''
        );
    }

    lines.push(
        'We appreciate your trust in SmartCardLink.',
        '',
        'Best regards,',
        'SmartCardLink'
    );

    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
            <h2 style="margin-bottom:12px;">Your SmartCardLink vCard is Ready</h2>
            <p>Hello ${safeClient.fullName || 'Client'},</p>
            <p>Thank you for choosing <strong>SmartCardLink</strong> services.</p>

            <p><strong>Your live vCard URL:</strong><br>${vcardUrl || 'Not available'}</p>

            ${isPro ? `
                <div style="margin:16px 0;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
                    <p style="margin:0 0 8px;"><strong>Your PRO access details</strong></p>
                    <p style="margin:0 0 6px;">CV Password: <strong>${cvPassword || 'Not available'}</strong></p>
                    <p style="margin:0;">Analytics Access Token: <strong>${analyticsAccessToken || 'Not available'}</strong></p>
                </div>
                <p>Use the CV password to control who can view or download your resume.</p>
                <p>Use your exact vCard URL as the analytics access token when prompted inside your profile.</p>
            ` : `
                <div style="margin:16px 0;padding:14px;border:1px solid #f59e0b;border-radius:10px;background:#fff8e1;">
                    <p style="margin:0 0 8px;"><strong>Upgrade to PRO vCard</strong></p>
                    <p style="margin:0;">Unlock custom theme color, Professional Resume, protected CV access, profile analytics, and smart reminder tools for a stronger professional profile.</p>
                </div>
            `}

            <p>We appreciate your trust in SmartCardLink.</p>
            <p>Best regards,<br><strong>SmartCardLink</strong></p>
        </div>
    `;

    return {
        subject,
        text: lines.join('\n'),
        html,
    };
};

const respSuccess = (res, data = null, message = 'Operation successful', statusCode = 200, meta = null) => {
    return res.status(statusCode).json({ status: 'success', message, data, meta });
};

const respError = (res, message = 'Internal server error', statusCode = 500, data = null, errorObj = null) => {
    if (errorObj) {
        logger.error({ err: errorObj }, message);
    }
    return res.status(statusCode).json({ status: 'error', message, data });
};

const mapClientForResponse = (clientDoc) => {
    const client = clientDoc && clientDoc.toObject ? clientDoc.toObject() : clientDoc;
    if (!client) return null;

    return {
        _id: String(client._id),
        id: String(client._id),
        fullName: client.fullName || '',
        title: client.title || '',
        slug: client.slug || '',
        phone1: client.phone1 || '',
        phone2: client.phone2 || '',
        phone3: client.phone3 || '',
        email1: client.email1 || '',
        email2: client.email2 || '',
        email3: client.email3 || '',
        company: client.company || '',
        companyName: client.company || '',
        businessWebsite: client.businessWebsite || '',
        portfolioWebsite: client.portfolioWebsite || '',
        locationMap: client.locationMap || '',
        locationMapUrl: client.locationMap || '',
        address: client.address || '',
        bio: client.bio || '',
        photoUrl: client.photoUrl || '',
        appointmentUrl: client.appointmentUrl || '',
        bookingLink: client.appointmentUrl || '',
        packageType: client.packageType || 'standard',
        themeColor: client.themeColor || '#FFD700',
        themeName: client.themeName || 'Default Gold',
        status: client.status || 'Pending',
        vcardAssetUrl: client.vcardAssetUrl || '',
        vcardUrl: client.vcardUrl || '',
        qrCodeUrl: client.qrCodeUrl || '',
        vcardCreatedDate: client.vcardCreatedDate || null,
        subscriptionLastPaidDate: client.subscriptionLastPaidDate || null,
        subscriptionRenewalNote: client.subscriptionRenewalNote || '',
        resume: client.resume || {
            enabled: false,
            fileUrl: '',
            fileName: '',
            passwordHash: '',
            passwordLastGeneratedAt: null,
        },
        analytics: client.analytics || {
            profileViews: 0,
            resumeViews: 0,
            resumeDownloads: 0,
        },
        socialLinks: client.socialLinks || {},
        workingHours: client.workingHours || {},
        history: Array.isArray(client.history) ? client.history : [],
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
    };
};

const applyPayloadToClient = async (client, payload, actor, notes) => {
    const incoming = payload || {};
    const newFullName = String(incoming.fullName || client.fullName || '').trim();

    if (!newFullName) {
        throw new Error('Full name is required.');
    }

    if (!Array.isArray(client.history)) {
        client.history = [];
    }

    ensureResumeDefaults(client);

    if (newFullName !== client.fullName) {
        const oldSlug = client.slug;
        client.slug = await generateUniqueSlug(newFullName, client._id);
        client.history.push({
            action: 'SLUG_REGENERATED',
            actor,
            notes: 'Slug changed from ' + oldSlug + ' to ' + client.slug,
        });
    }

    client.fullName = newFullName;
    client.title = String(incoming.title || '').trim();
    client.phone1 = String(incoming.phone1 || '').trim();
    client.phone2 = String(incoming.phone2 || '').trim();
    client.phone3 = String(incoming.phone3 || '').trim();
    client.email1 = String(incoming.email1 || '').trim().toLowerCase();
    client.email2 = String(incoming.email2 || '').trim().toLowerCase();
    client.email3 = String(incoming.email3 || '').trim().toLowerCase();
    client.company = String(incoming.company || incoming.companyName || '').trim();
    client.businessWebsite = sanitizeUrl(incoming.businessWebsite);
    client.portfolioWebsite = sanitizeUrl(incoming.portfolioWebsite);
    client.locationMap = sanitizeUrl(incoming.locationMap || incoming.locationMapUrl);
    client.address = String(incoming.address || '').trim();
    client.bio = String(incoming.bio || '').trim();
    client.themeColor = ensureColor(incoming.themeColor || client.themeColor);
    client.themeName = String(incoming.themeName || client.themeName || 'Default Gold').trim() || 'Default Gold';
    client.appointmentUrl = buildAppointmentUrl(client.email1, incoming.appointmentUrl || incoming.bookingLink || client.appointmentUrl);

    if (!client.socialLinks || typeof client.socialLinks !== 'object') {
        client.socialLinks = {
            facebook: '',
            instagram: '',
            twitter: '',
            linkedin: '',
            tiktok: '',
            youtube: ''
        };
    }

    if (!client.workingHours || typeof client.workingHours !== 'object') {
        client.workingHours = {
            monFriStart: '',
            monFriEnd: '',
            satStart: '',
            satEnd: '',
            sunStart: '',
            sunEnd: ''
        };
    }

    const socialLinks = incoming.socialLinks || {};
    client.socialLinks.facebook = sanitizeUrl(socialLinks.facebook || incoming.facebook || '');
    client.socialLinks.instagram = sanitizeUrl(socialLinks.instagram || incoming.instagram || '');
    client.socialLinks.twitter = sanitizeUrl(socialLinks.twitter || incoming.twitter || '');
    client.socialLinks.linkedin = sanitizeUrl(socialLinks.linkedin || incoming.linkedin || '');
    client.socialLinks.tiktok = sanitizeUrl(socialLinks.tiktok || incoming.tiktok || '');
    client.socialLinks.youtube = sanitizeUrl(socialLinks.youtube || incoming.youtube || '');

    const hours = incoming.workingHours || {};
    client.workingHours.monFriStart = String(hours.monFriStart || incoming.monFriStart || '').trim();
    client.workingHours.monFriEnd = String(hours.monFriEnd || incoming.monFriEnd || '').trim();
    client.workingHours.satStart = String(hours.satStart || incoming.satStart || '').trim();
    client.workingHours.satEnd = String(hours.satEnd || incoming.satEnd || '').trim();
    client.workingHours.sunStart = String(hours.sunStart || incoming.sunStart || '').trim();
    client.workingHours.sunEnd = String(hours.sunEnd || incoming.sunEnd || '').trim();

    if (incoming.photoUrl) {
        client.photoUrl = sanitizeUrl(incoming.photoUrl);
    }

    client.history.push({
        action: 'ADMIN_SAVE',
        actor,
        notes: notes || 'Admin form data saved',
    });
};

const generateVcardContent = (client) => {
    const vCard = vCardJS();
    const parts = String(client.fullName || '').trim().split(/\s+/).filter(Boolean);
    vCard.firstName = parts.shift() || client.fullName || '';
    vCard.lastName = parts.join(' ');
    vCard.organization = client.company || '';
    vCard.title = client.title || '';

    if (client.phone1) vCard.cellPhone = client.phone1;
    if (client.phone2) vCard.workPhone = client.phone2;
    if (client.email1) vCard.email = client.email1;
    if (client.email2) vCard.workEmail = client.email2;
    if (client.address) vCard.homeAddress.label = client.address;
    if (client.businessWebsite) vCard.url = client.businessWebsite;

    if (client.photoUrl && /^https?:\/\//i.test(client.photoUrl)) {
        try {
            vCard.photo.attachFromUrl(client.photoUrl, 'JPEG');
        } catch (error) {
            logger.warn({ err: error }, 'Skipping photo attach for vCard');
        }
    }

    const notes = [];
    if (client.bio) notes.push(client.bio);
    if (client.portfolioWebsite) notes.push('Portfolio: ' + client.portfolioWebsite);
    if (client.locationMap) notes.push('Location: ' + client.locationMap);
    if (client.appointmentUrl) notes.push('Booking: ' + client.appointmentUrl);

    const socialEntries = Object.entries(client.socialLinks || {}).filter((entry) => entry[1]);
    if (socialEntries.length > 0) {
        notes.push('Social: ' + socialEntries.map((entry) => entry[0] + ': ' + entry[1]).join(' | '));
    }

    vCard.note = notes.join(' || ');
    return vCard.getFormattedString();
};

const uploadVcfToCloudinary = async (slug, vcfContent) => {
    if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
        throw new Error('Cloudinary is not configured.');
    }

    const base64Vcf = Buffer.from(vcfContent, 'utf8').toString('base64');
    const result = await cloudinary.uploader.upload(
        'data:text/vcard;base64,' + base64Vcf,
        {
            folder: 'smartcardlink_vcards',
            resource_type: 'raw',
            public_id: slug + '_vcard',
            format: 'vcf',
            overwrite: true,
        }
    );
    return result.secure_url;
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
});

const publicLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
});

const allowedOrigins = [APP_BASE_URL, FRONTEND_BASE_URL, VCARD_BASE_URL]
    .map((value) => {
        try {
            return new URL(value).origin;
        } catch (error) {
            return null;
        }
    })
    .filter(Boolean);

if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
    });
}

const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS)
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    : null;

const sendEmail = async (to, subject, text, html) => {
    if (!transporter || !to) return false;
    try {
        await transporter.sendMail({
            from: SMTP_USER,
            to,
            subject,
            text,
            html: html || '<div style="font-family:Arial,sans-serif;white-space:pre-wrap;">' + text + '</div>',
        });
        return true;
    } catch (error) {
        logger.error({ err: error, to, subject }, 'Email send failure');
        return false;
    }
};

app.use(pinoHttp({ logger }));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.set('trust proxy', 1);

mongoose.connect(MONGO_URI)
    .then(() => logger.info('DB Connected'))
    .catch((error) => {
        logger.fatal({ err: error }, 'MongoDB connection failed');
        process.exit(1);
    });

app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED';
    return res.status(dbStatus === 'CONNECTED' ? 200 : 503).json({
        uptime: process.uptime(),
        database: dbStatus,
        service: 'SmartCardLink-API',
    });
});

app.get('/api/payment-config', publicLimiter, (req, res) => {
    try {
        return respSuccess(res, {
            pochiNumber: PAYMENT_POCHI_NUMBER,
            prices: PACKAGE_PRICES,
        }, 'Payment config loaded successfully.');
    } catch (error) {
        return respError(res, 'Failed to load payment config.', 500, null, error);
    }
});

app.get('/api/admin/clients', publicLimiter, async (req, res) => {
    try {
        const search = String(req.query.q || '').trim();
        const requestedStatus = String(req.query.status || '').trim();
        const filter = {};

        if (search) {
            filter.$or = [
                { fullName: new RegExp(search, 'i') },
                { company: new RegExp(search, 'i') },
                { email1: new RegExp(search, 'i') },
                { phone1: new RegExp(search, 'i') },
            ];
        }

        if (requestedStatus) {
            filter.status = normalizeStatus(requestedStatus);
        } else {
            filter.status = { $ne: 'Deleted' };
        }

        const records = await Client.find(filter).sort({ createdAt: -1 }).lean();
        const data = records.map(mapClientForResponse);
        return respSuccess(res, data, 'Clients loaded successfully', 200, { total: data.length });
    } catch (error) {
        return respError(res, 'Failed to load clients.', 500, null, error);
    }
});

app.get('/api/clients/:id', publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);
        return respSuccess(res, mapClientForResponse(client), 'Client loaded successfully');
    } catch (error) {
        return respError(res, 'Failed to load client.', 500, null, error);
    }
});

app.post('/api/vcard/:slug/analytics-access', publicLimiter, async (req, res) => {
    try {
        const slug = String(req.params.slug || '').trim();
        const accessToken = String(req.body && req.body.accessToken || '').trim();

        if (!accessToken) {
            return respError(res, 'Access token is required.', 400);
        }

        if (!isValidHttpUrl(accessToken)) {
            return respError(res, 'Access token format is invalid.', 400);
        }

        const tokenSlug = getSlugFromUrl(accessToken);
        if (!tokenSlug || tokenSlug !== slug) {
            return respError(res, 'Access token is invalid for this profile.', 403);
        }

        const client = await Client.findOne({ slug, status: 'Active' });
        if (!client) return respError(res, 'Client not found.', 404);

        const expectedUrl = String(client.vcardUrl || '').trim();
        if (!expectedUrl || accessToken !== expectedUrl) {
            return respError(res, 'Access token does not match this profile.', 403);
        }

        ensureResumeDefaults(client);

        return respSuccess(res, {
            analytics: client.analytics,
        }, 'Analytics access granted.');
    } catch (error) {
        return respError(res, 'Failed to verify analytics access.', 500, null, error);
    }
});

app.post('/api/clients/:id/resume-upload', publicLimiter, upload.single('resume'), async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);
        if (!req.file) return respError(res, 'No resume PDF provided.', 400);

        const mimeType = String(req.file.mimetype || '').toLowerCase();
        if (mimeType !== 'application/pdf') {
            return respError(res, 'Only PDF resume files are allowed.', 400);
        }

        ensureResumeDefaults(client);

        const uploaded = await uploadResumePdfToCloudinary(client.slug, req.file);

        client.resume.enabled = true;
        client.resume.fileUrl = uploaded.fileUrl;
        client.resume.fileName = uploaded.fileName;

        client.history.push({
            action: 'RESUME_UPLOAD',
            actor: 'admin',
            notes: 'Resume PDF uploaded for client profile',
        });

        await client.save();

        return respSuccess(res, {
            resume: client.resume,
        }, 'Resume uploaded successfully.');
    } catch (error) {
        return respError(res, 'Failed to upload resume.', 500, null, error);
    }
});

app.post('/api/clients', publicLimiter, async (req, res) => {
    try {
        const payload = req.body || {};
        const fullName = String(payload.fullName || '').trim();
        const phone1 = String(payload.phone1 || '').trim();
        const email1 = String(payload.email1 || '').trim().toLowerCase();

        if (!fullName) return respError(res, 'Full name is required.', 400);
        if (!phone1) return respError(res, 'Primary phone number is required.', 400);
        if (!email1) return respError(res, 'Primary email is required.', 400);

        const slug = await generateUniqueSlug(fullName);
        const client = new Client({
            fullName,
            title: String(payload.title || '').trim(),
            slug,
            phone1,
            phone2: String(payload.phone2 || '').trim(),
            phone3: String(payload.phone3 || '').trim(),
            email1,
            email2: String(payload.email2 || '').trim().toLowerCase(),
            email3: String(payload.email3 || '').trim().toLowerCase(),
            company: String(payload.company || payload.companyName || '').trim(),
            businessWebsite: sanitizeUrl(payload.businessWebsite),
            portfolioWebsite: sanitizeUrl(payload.portfolioWebsite),
            locationMap: sanitizeUrl(payload.locationMap || payload.locationMapUrl),
            address: String(payload.address || '').trim(),
            bio: String(payload.bio || '').trim(),
            appointmentUrl: buildAppointmentUrl(email1, payload.appointmentUrl || payload.bookingLink),
            packageType: String(payload.packageType || 'standard').trim().toLowerCase() === 'pro' ? 'pro' : 'standard',
            themeColor: ensureColor(payload.themeColor || '#FFD700'),
            themeName: String(payload.themeName || 'Default Gold').trim() || 'Default Gold',
            socialLinks: {
                facebook: sanitizeUrl(payload.socialLinks && payload.socialLinks.facebook),
                instagram: sanitizeUrl(payload.socialLinks && payload.socialLinks.instagram),
                twitter: sanitizeUrl(payload.socialLinks && payload.socialLinks.twitter),
                linkedin: sanitizeUrl(payload.socialLinks && payload.socialLinks.linkedin),
                tiktok: sanitizeUrl(payload.socialLinks && payload.socialLinks.tiktok),
                youtube: sanitizeUrl(payload.socialLinks && payload.socialLinks.youtube),
            },
            workingHours: {
                monFriStart: String(payload.workingHours && payload.workingHours.monFriStart || '').trim(),
                monFriEnd: String(payload.workingHours && payload.workingHours.monFriEnd || '').trim(),
                satStart: String(payload.workingHours && payload.workingHours.satStart || '').trim(),
                satEnd: String(payload.workingHours && payload.workingHours.satEnd || '').trim(),
                sunStart: String(payload.workingHours && payload.workingHours.sunStart || '').trim(),
                sunEnd: String(payload.workingHours && payload.workingHours.sunEnd || '').trim(),
            },
            status: 'Pending',
            history: [{
                action: 'CLIENT_ONBOARDING',
                actor: 'client_form',
                notes: 'Client submitted public registration form',
            }],
        });

        await client.save();

        res.status(201).json({
            status: 'success',
            message: 'Successful. Record created.',
            recordId: String(client._id),
            data: {
                _id: String(client._id),
                id: String(client._id)
            }
        });

        setImmediate(() => {
            if (ADMIN_EMAIL) {
                sendEmail(
                    ADMIN_EMAIL,
                    'New SmartCardLink lead received',
                    'A new lead has been submitted for ' + client.fullName + '. Record ID: ' + client._id,
                    '<div style="font-family:Arial,sans-serif;"><h3>New SmartCardLink lead received</h3><p><strong>Name:</strong> ' + client.fullName + '</p><p><strong>Record ID:</strong> ' + client._id + '</p><p><strong>Status:</strong> Pending</p></div>'
                ).catch((emailError) => {
                    logger.error({ err: emailError, recordId: String(client._id) }, 'Background lead email failed');
                });
            }
        });

        return;

    } catch (error) {
        return respError(res, 'Failed to create client record.', 500, null, error);
    }
});

app.post('/api/upload-photo', publicLimiter, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return respError(res, 'No photo file provided.', 400);
        }

        if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
            return respError(res, 'Cloudinary is not configured.', 500);
        }

        const uploaded = await cloudinary.uploader.upload(
            'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64'),
            {
                folder: 'smartcardlink_photos',
                resource_type: 'image',
                overwrite: true,
            }
        );

        return respSuccess(res, {
            photoUrl: uploaded.secure_url,
        }, 'Photo uploaded successfully.');
    } catch (error) {
        return respError(res, 'Failed to upload photo.', 500, null, error);
    }
});

app.put('/api/clients/:id', publicLimiter, upload.single('photo'), async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);

        await applyPayloadToClient(client, req.body || {}, 'admin', String(req.body && req.body.notes || '').trim() || 'Profile saved from admin form');

        if (req.file) {
            if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
                return respError(res, 'Cloudinary is not configured.', 500);
            }
            const uploaded = await cloudinary.uploader.upload(
                'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64'),
                {
                    folder: 'smartcardlink_photos',
                    resource_type: 'image',
                    overwrite: true,
                }
            );
            client.photoUrl = uploaded.secure_url;
        }

        client.status = 'Processed';
        client.appointmentUrl = buildAppointmentUrl(client.email1, client.appointmentUrl);
        await client.save();

        return respSuccess(res, mapClientForResponse(client), 'Client information saved successfully.');
    } catch (error) {
        return respError(res, 'Failed to save client information.', 500, null, error);
    }
});

app.put('/api/clients/:id/status/:newStatus', publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);

        const notes = String(req.body && req.body.notes || '').trim();
        if (!notes) return respError(res, 'A reason is required for this action.', 400);

        const requestedStatus = String(req.params.newStatus || '').trim().toLowerCase();
        const nextStatus = normalizeStatus(requestedStatus);
        const now = new Date();

        if (nextStatus === 'Deleted') {
            return respError(res, 'Delete is not allowed through this status route.', 400);
        }

        client.status = nextStatus;

        if (nextStatus === 'Active') {
            client.vcardCreatedDate = now;
            client.subscriptionLastPaidDate = now;
            client.subscriptionRenewalNote = notes;
        }

        if (nextStatus === 'Suspended') {
            client.subscriptionRenewalNote = notes;
        }

        client.history.push({
            action: 'STATUS_CHANGE',
            actor: 'admin',
            notes: 'Status changed to ' + nextStatus + '. Reason: ' + notes,
        });

        await client.save();

        return respSuccess(res, mapClientForResponse(client), 'Client status updated successfully.');
    } catch (error) {
        return respError(res, 'Failed to update client status.', 500, null, error);
    }
});

app.delete('/api/clients/:id', publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);

        const notes = String(req.body && req.body.notes || req.query.notes || '').trim();
        if (!notes) return respError(res, 'A delete reason is required.', 400);

        client.status = 'Deleted';
        client.history.push({
            action: 'DELETE',
            actor: 'admin',
            notes,
        });
        await client.save();

        return respSuccess(res, mapClientForResponse(client), 'Client deleted successfully.');
    } catch (error) {
        return respError(res, 'Failed to delete client.', 500, null, error);
    }
});

app.post('/api/clients/:id/vcard', publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);
        if (!client.email1) return respError(res, 'Primary client email is required before deployment.', 400);

        ensureResumeDefaults(client);

        const isPro = String(client.packageType || 'standard').toLowerCase() === 'pro';
        let generatedResumePassword = '';

        if (isPro && client.resume && client.resume.enabled) {
            generatedResumePassword = generateFourDigitPassword();
            client.resume.passwordHash = hashSecret(generatedResumePassword);
            client.resume.passwordLastGeneratedAt = new Date();
        }

        const vcfContent = generateVcardContent(client);
        const vcardAssetUrl = await uploadVcfToCloudinary(client.slug, vcfContent);
        const publicUrl = VCARD_BASE_URL.replace(/\/$/, '') + '/?slug=' + client.slug;
        const qrCodeData = await qrcode.toDataURL(publicUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            scale: 8,
        });

        client.vcardAssetUrl = vcardAssetUrl;
        client.vcardUrl = publicUrl;
        client.qrCodeUrl = qrCodeData;
        client.status = 'Active';

        if (!client.vcardCreatedDate) {
            client.vcardCreatedDate = new Date();
        }
        if (!client.subscriptionLastPaidDate) {
            client.subscriptionLastPaidDate = new Date();
        }
        if (!client.subscriptionRenewalNote) {
            client.subscriptionRenewalNote = 'Initial vCard activation';
        }

        client.appointmentUrl = buildAppointmentUrl(client.email1, client.appointmentUrl);
        client.history.push({
            action: 'VCARD_DEPLOYMENT',
            actor: 'admin',
            notes: 'vCard deployed to ' + publicUrl,
        });

        await client.save();

        if (client.email1) {
            const deliveryEmail = buildClientDeliveryEmail(client, {
                cvPassword: generatedResumePassword,
            });

            sendEmail(
                client.email1,
                deliveryEmail.subject,
                deliveryEmail.text,
                deliveryEmail.html
            ).catch((emailError) => {
                logger.error({ err: emailError, clientId: String(client._id) }, 'Client delivery email failed');
            });
        }

        return respSuccess(res, {
            recordId: String(client._id),
            slug: client.slug,
            vcardAssetUrl,
            vcardUrl: publicUrl,
            qrCodeUrl: qrCodeData,
            appointmentUrl: client.appointmentUrl,
            email1: client.email1,
            analyticsAccessToken: publicUrl,
            resumePasswordGenerated: generatedResumePassword ? true : false,
        }, 'vCard created successfully.');
    } catch (error) {
        return respError(res, 'Failed to create vCard.', 500, null, error);
    }
});

app.get('/api/vcard/:slug', publicLimiter, async (req, res) => {
    try {
        const slug = String(req.params.slug || '').trim();
        const client = await Client.findOne({ slug, status: 'Active' });
        if (!client) return respError(res, 'Card profile is currently inactive or missing.', 404);

        ensureResumeDefaults(client);
        await incrementClientAnalytics(client._id, 'profileViews');

        return respSuccess(res, mapClientForResponse(client), 'Profile loaded successfully.');
    } catch (error) {
        return respError(res, 'Failed to load public vCard.', 500, null, error);
    }
});

app.post('/api/vcard/:slug/resume-access', publicLimiter, async (req, res) => {
    try {
        const slug = String(req.params.slug || '').trim();
        const password = String(req.body && req.body.password || '').trim();
        const mode = String(req.body && req.body.mode || 'view').trim().toLowerCase();

        if (!password) return respError(res, 'Resume password is required.', 400);
        if (!['view', 'download'].includes(mode)) return respError(res, 'Invalid resume access mode.', 400);

        const client = await Client.findOne({ slug, status: 'Active' });
        if (!client) return respError(res, 'Client not found.', 404);

        ensureResumeDefaults(client);

        if (String(client.packageType || 'standard').toLowerCase() !== 'pro') {
            return respError(res, 'Resume access is available on PRO profiles only.', 403);
        }

        if (!client.resume.enabled || !client.resume.fileUrl || !client.resume.passwordHash) {
            return respError(res, 'Resume is not configured for this profile.', 404);
        }

        if (!verifySecret(password, client.resume.passwordHash)) {
            return respError(res, 'Incorrect resume password.', 403);
        }

        await incrementClientAnalytics(client._id, mode === 'download' ? 'resumeDownloads' : 'resumeViews');

        return respSuccess(res, {
            fileUrl: client.resume.fileUrl,
            fileName: client.resume.fileName || 'resume.pdf',
            mode,
        }, 'Resume access granted.');
    } catch (error) {
        return respError(res, 'Failed to verify resume access.', 500, null, error);
    }
});

app.post('/api/clients/:id/resume-regenerate-password', publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);

        ensureResumeDefaults(client);

        if (String(client.packageType || 'standard').toLowerCase() !== 'pro') {
            return respError(res, 'Resume password regeneration is available on PRO profiles only.', 403);
        }

        if (!client.resume.enabled || !client.resume.fileUrl) {
            return respError(res, 'Resume is not configured for this profile.', 400);
        }

        const generatedResumePassword = generateFourDigitPassword();
        client.resume.passwordHash = hashSecret(generatedResumePassword);
        client.resume.passwordLastGeneratedAt = new Date();

        client.history.push({
            action: 'RESUME_PASSWORD_REGENERATED',
            actor: 'admin',
            notes: 'Resume password regenerated',
        });

        await client.save();

        return respSuccess(res, {
            generatedPassword: generatedResumePassword,
            passwordLastGeneratedAt: client.resume.passwordLastGeneratedAt,
        }, 'Resume password regenerated successfully.');
    } catch (error) {
        return respError(res, 'Failed to regenerate resume password.', 500, null, error);
    }
});

Object.entries(rootStaticFiles).forEach(([route, filePath]) => {
    app.get(route, (req, res) => res.sendFile(filePath));
});

app.use(express.static(staticPath, {
    extensions: ['html'],
    maxAge: '1h',
}));

app.all('/api/*', (req, res) => respError(res, 'Requested API resource does not exist.', 404));

app.get('*', (req, res) => {
    if (req.path === '/' || req.path === '') {
        return res.sendFile(path.join(staticPath, 'index.html'));
    }
    return res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
    logger.info('Server on ' + PORT);
});

