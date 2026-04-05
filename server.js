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
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const pino = require('pino');
const pinoHttp = require('pino-http');
require('dotenv').config();

const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    base: { pid: false },
    timestamp: pino.stdTimeFunctions.isoTime,
});

const app = express();
app.disable('x-powered-by');
mongoose.set('bufferCommands', false);

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

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || '';

const staticPath = path.join(__dirname, 'public');
const rootStaticFiles = {
    '/client-form.html': path.join(__dirname, 'client-form.html'),
    '/admin-form.html': path.join(__dirname, 'admin-form.html'),
};

const PUBLIC_VCARD_CACHE_TTL_MS = Number(process.env.PUBLIC_VCARD_CACHE_TTL_MS || 300000);
const PUBLIC_VCARD_CACHE_MAX_ITEMS = Number(process.env.PUBLIC_VCARD_CACHE_MAX_ITEMS || 500);
const publicVcardCache = new Map();

const PUBLIC_VCARD_PROJECTION = {
    fullName: 1,
    title: 1,
    slug: 1,
    phone1: 1,
    phone2: 1,
    phone3: 1,
    email1: 1,
    email2: 1,
    email3: 1,
    company: 1,
    businessWebsite: 1,
    portfolioWebsite: 1,
    locationMap: 1,
    address: 1,
    bio: 1,
    photoUrl: 1,
    appointmentUrl: 1,
    themeColor: 1,
    packageType: 1,
    themeName: 1,
    status: 1,
    vcardAssetUrl: 1,
    vcardUrl: 1,
    qrCodeUrl: 1,
    vcardCreatedDate: 1,
    subscriptionLastPaidDate: 1,
    subscriptionRenewalNote: 1,
    resume: 1,
    analytics: 1,
    socialLinks: 1,
    workingHours: 1,
    history: 1,
    createdAt: 1,
    updatedAt: 1,
};

const prunePublicVcardCache = () => {
    const now = Date.now();

    for (const [slug, entry] of publicVcardCache.entries()) {
        if (!entry || (now - entry.cachedAt) > PUBLIC_VCARD_CACHE_TTL_MS) {
            publicVcardCache.delete(slug);
        }
    }

    while (publicVcardCache.size > PUBLIC_VCARD_CACHE_MAX_ITEMS) {
        const oldestKey = publicVcardCache.keys().next().value;
        if (!oldestKey) break;
        publicVcardCache.delete(oldestKey);
    }
};

const getCachedPublicVcard = (slug) => {
    const key = String(slug || '').trim().toLowerCase();
    if (!key) return null;

    const entry = publicVcardCache.get(key);
    if (!entry) return null;

    const ageMs = Date.now() - entry.cachedAt;
    if (ageMs > PUBLIC_VCARD_CACHE_TTL_MS) {
        publicVcardCache.delete(key);
        return null;
    }

    return {
        payload: entry.payload,
        ageMs,
    };
};

const setCachedPublicVcard = (slug, payload) => {
    const key = String(slug || '').trim().toLowerCase();
    if (!key || !payload) return;

    publicVcardCache.set(key, {
        payload,
        cachedAt: Date.now(),
    });

    prunePublicVcardCache();
};

setInterval(prunePublicVcardCache, 60 * 1000).unref();

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
    objectKey: { type: String, trim: true, default: '' },
    accessCode: { type: String, trim: true, default: '' },
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

const normalizeWorkingHours = (hours = {}) => {
    const clean = (value) => String(value || '').trim();

    return {
        monFriStart: clean(hours.monFriStart) || '08:00',
        monFriEnd: clean(hours.monFriEnd) || '17:00',
        satStart: clean(hours.satStart) || '09:00',
        satEnd: clean(hours.satEnd) || '12:00',
        sunStart: clean(hours.sunStart),
        sunEnd: clean(hours.sunEnd),
    };
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

const normalizeComparableUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        parsed.hash = '';
        return parsed.toString().replace(/\/+$/, '');
    } catch (error) {
        return String(value || '').trim().replace(/\/+$/, '');
    }
};

const getCleanResumeState = () => ({
    enabled: false,
    fileUrl: '',
    fileName: '',
    objectKey: '',
    accessCode: '',
    passwordHash: '',
    passwordLastGeneratedAt: null,
});

const repairLegacyResumeField = async (client) => {
    const rawResume = client && client.get ? client.get('resume') : client.resume;
    const isPlainObject = rawResume && typeof rawResume === 'object' && !Array.isArray(rawResume);

    if (isPlainObject) {
        return client;
    }

    await Client.updateOne(
        { _id: client._id },
        { $set: { resume: getCleanResumeState() } }
    );

    return Client.findById(client._id);
};

const ensureResumeDefaults = (client) => {
    const cleanResume = getCleanResumeState();

    const rawResume = client.get ? client.get('resume') : client.resume;
    const isPlainObject = rawResume && typeof rawResume === 'object' && !Array.isArray(rawResume);

    if (!isPlainObject) {
        client.set('resume', cleanResume);
    } else {
        client.set('resume.enabled', !!rawResume.enabled);
        client.set('resume.fileUrl', String(rawResume.fileUrl || ''));
        client.set('resume.fileName', String(rawResume.fileName || ''));
        client.set('resume.objectKey', String(rawResume.objectKey || ''));
        client.set('resume.accessCode', String(rawResume.accessCode || ''));
        client.set('resume.passwordHash', String(rawResume.passwordHash || ''));
        client.set('resume.passwordLastGeneratedAt', rawResume.passwordLastGeneratedAt || null);
    }

    const rawAnalytics = client.get ? client.get('analytics') : client.analytics;
    const analyticsIsObject = rawAnalytics && typeof rawAnalytics === 'object' && !Array.isArray(rawAnalytics);

    if (!analyticsIsObject) {
        client.set('analytics', {
            profileViews: 0,
            resumeViews: 0,
            resumeDownloads: 0,
        });
    } else {
        client.set('analytics.profileViews', Number(rawAnalytics.profileViews || 0));
        client.set('analytics.resumeViews', Number(rawAnalytics.resumeViews || 0));
        client.set('analytics.resumeDownloads', Number(rawAnalytics.resumeDownloads || 0));
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

const uploadResumePdfToR2 = async (slug, file) => {
    if (!(r2 && R2_BUCKET_NAME && R2_PUBLIC_BASE_URL)) {
        throw new Error('R2 is not configured.');
    }

    const originalName = String(file.originalname || 'resume.pdf').trim() || 'resume.pdf';
    const normalizedFileName = originalName.toLowerCase().endsWith('.pdf') ? originalName : (originalName + '.pdf');
    const safeBaseName = normalizedFileName
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .toLowerCase() || 'resume';

    const objectKey = `resumes/${slug}_${Date.now()}_${safeBaseName}.pdf`;

    await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        Body: file.buffer,
        ContentType: 'application/pdf',
    }));

    const publicBase = String(R2_PUBLIC_BASE_URL).replace(/\/+$/, '');

    return {
        fileUrl: `${publicBase}/${objectKey}`,
        fileName: normalizedFileName,
        objectKey,
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

const ensureDatabaseReady = (res) => {
    if (mongoose.connection.readyState !== 1) {
        return respError(res, 'Database is temporarily unavailable. Please try again shortly.', 503);
    }
    return true;
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
        resume: {
            enabled: !!(client.resume && client.resume.enabled),
            fileUrl: client.resume && client.resume.fileUrl ? client.resume.fileUrl : '',
            fileName: client.resume && client.resume.fileName ? client.resume.fileName : '',
            passwordLastGeneratedAt: client.resume && client.resume.passwordLastGeneratedAt ? client.resume.passwordLastGeneratedAt : null,
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

    const hours = normalizeWorkingHours({
        monFriStart: incoming.workingHours && incoming.workingHours.monFriStart || incoming.monFriStart || '',
        monFriEnd: incoming.workingHours && incoming.workingHours.monFriEnd || incoming.monFriEnd || '',
        satStart: incoming.workingHours && incoming.workingHours.satStart || incoming.satStart || '',
        satEnd: incoming.workingHours && incoming.workingHours.satEnd || incoming.satEnd || '',
        sunStart: incoming.workingHours && incoming.workingHours.sunStart || incoming.sunStart || '',
        sunEnd: incoming.workingHours && incoming.workingHours.sunEnd || incoming.sunEnd || ''
    });

    client.workingHours.monFriStart = hours.monFriStart;
    client.workingHours.monFriEnd = hours.monFriEnd;
    client.workingHours.satStart = hours.satStart;
    client.workingHours.satEnd = hours.satEnd;
    client.workingHours.sunStart = hours.sunStart;
    client.workingHours.sunEnd = hours.sunEnd;

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
const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (origin.includes('localhost')) return true;
    if (origin.includes('127.0.0.1')) return true;
    return false;
};

if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
    });
}

const r2 = (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    })
    : null;

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
app.set('trust proxy', 1);

// Hard CORS headers first, before other middleware/routes
app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (isAllowedOrigin(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }

    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const mongoOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    family: 4,
    maxPoolSize: 10,
    minPoolSize: 1,
    autoIndex: false,
};

let mongoInitialConnectAttempted = false;
let mongoReconnectTimer = null;

const scheduleMongoReconnect = () => {
    if (mongoReconnectTimer) return;

    mongoReconnectTimer = setTimeout(async () => {
        mongoReconnectTimer = null;
        try {
            logger.warn('Retrying MongoDB connection...');
            await mongoose.connect(MONGO_URI, mongoOptions);
            logger.info('MongoDB reconnect attempt succeeded');
        } catch (error) {
            logger.error({ err: error }, 'MongoDB reconnect attempt failed');
            scheduleMongoReconnect();
        }
    }, 10000);
};

const connectMongo = async () => {
    try {
        await mongoose.connect(MONGO_URI, mongoOptions);
        mongoInitialConnectAttempted = true;
        logger.info('DB Connected');
    } catch (error) {
        mongoInitialConnectAttempted = true;
        logger.error({ err: error }, 'Initial MongoDB connection failed; server will stay up and retry');
        scheduleMongoReconnect();
    }
};

mongoose.connection.on('connected', () => logger.info('MongoDB ready'));
mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    scheduleMongoReconnect();
});
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error', (error) => logger.error({ err: error }, 'MongoDB runtime error'));

connectMongo();

app.get('/health', (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    return res.status(200).json({
        uptime: process.uptime(),
        database: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
        service: 'SmartCardLink-API',
        startup: mongoInitialConnectAttempted ? 'COMPLETED' : 'PENDING',
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
        if (!ensureDatabaseReady(res)) return;
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
        if (!ensureDatabaseReady(res)) return;
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);
        return respSuccess(res, mapClientForResponse(client), 'Client loaded successfully');
    } catch (error) {
        return respError(res, 'Failed to load client.', 500, null, error);
    }
});

app.post('/api/vcard/:slug/analytics-access', publicLimiter, async (req, res) => {
    try {
        if (!ensureDatabaseReady(res)) return;
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

        const expectedUrl = normalizeComparableUrl(client.vcardUrl || '');
        const suppliedUrl = normalizeComparableUrl(accessToken);

        if (!expectedUrl || suppliedUrl !== expectedUrl) {
            return respError(res, 'Access token does not match this profile.', 403);
        }

        ensureResumeDefaults(client);

        return respSuccess(res, {
            analytics: client.analytics,
            resumeAccessCode: client.resume && client.resume.accessCode ? client.resume.accessCode : '',
        }, 'Analytics access granted.');
    } catch (error) {
        return respError(res, 'Failed to verify analytics access.', 500, null, error);
    }
});

app.post('/api/clients/:id/resume-upload', publicLimiter, upload.single('resume'), async (req, res) => {
    try {
        if (!ensureDatabaseReady(res)) return;
        let client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);
        if (!req.file) return respError(res, 'No resume PDF provided.', 400);

        client = await repairLegacyResumeField(client);
        if (!client) return respError(res, 'Client not found after resume repair.', 404);

        const mimeType = String(req.file.mimetype || '').toLowerCase();
        if (mimeType !== 'application/pdf') {
            return respError(res, 'Only PDF resume files are allowed.', 400);
        }

        ensureResumeDefaults(client);
        client.markModified('resume');

        if (String(client.packageType || 'standard').toLowerCase() !== 'pro') {
            return respError(res, 'Resume upload is available on PRO profiles only.', 403);
        }

        const uploaded = await uploadResumePdfToR2(client.slug, req.file);

        client.resume.enabled = true;
        client.resume.fileUrl = uploaded.fileUrl;
        client.resume.fileName = uploaded.fileName;
        client.resume.objectKey = uploaded.objectKey;

        client.history.push({
            action: 'RESUME_UPLOAD',
            actor: 'admin',
            notes: 'Resume PDF uploaded to R2 for client profile',
        });

        await client.save();

        return respSuccess(res, {
            resume: client.resume,
        }, 'Resume uploaded successfully.');
    } catch (error) {
        return respError(
            res,
            error && error.message ? error.message : 'Failed to upload resume.',
            500,
            null,
            error
        );
    }
});

app.post('/api/clients', publicLimiter, async (req, res) => {
    try {
        if (!ensureDatabaseReady(res)) return;
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
            workingHours: normalizeWorkingHours({
                monFriStart: payload.workingHours && payload.workingHours.monFriStart || '',
                monFriEnd: payload.workingHours && payload.workingHours.monFriEnd || '',
                satStart: payload.workingHours && payload.workingHours.satStart || '',
                satEnd: payload.workingHours && payload.workingHours.satEnd || '',
                sunStart: payload.workingHours && payload.workingHours.sunStart || '',
                sunEnd: payload.workingHours && payload.workingHours.sunEnd || '',
            }),
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
        if (!ensureDatabaseReady(res)) return;
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

        if (client.status !== 'Active' && client.status !== 'Suspended' && client.status !== 'Deleted') {
            client.status = 'Processed';
        }

        client.appointmentUrl = buildAppointmentUrl(client.email1, client.appointmentUrl);
        await client.save();

        return respSuccess(res, mapClientForResponse(client), 'Client information saved successfully.');
    } catch (error) {
        return respError(res, 'Failed to save client information.', 500, null, error);
    }
});

app.put('/api/clients/:id/status/:newStatus', publicLimiter, async (req, res) => {
    try {
        if (!ensureDatabaseReady(res)) return;
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
        if (!ensureDatabaseReady(res)) return;
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
        if (!ensureDatabaseReady(res)) return;
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);
        if (!client.email1) return respError(res, 'Primary client email is required before deployment.', 400);

        ensureResumeDefaults(client);

        const isPro = String(client.packageType || 'standard').toLowerCase() === 'pro';
        let generatedResumePassword = '';

        if (isPro && client.resume && client.resume.enabled) {
            generatedResumePassword = generateFourDigitPassword();
            client.resume.accessCode = generatedResumePassword;
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
        const slug = String(req.params.slug || '').trim().toLowerCase();
        if (!slug) {
            return respError(res, 'VCard identifier is required.', 400);
        }

        const cached = getCachedPublicVcard(slug);
        if (cached && cached.payload) {
            res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
            respSuccess(res, cached.payload, 'Profile loaded successfully (cached).');

            setImmediate(async () => {
                try {
                    await incrementClientAnalytics(cached.payload._id, 'profileViews');

                    if (mongoose.connection.readyState === 1) {
                        const freshClient = await Client.findOne(
                            { slug, status: 'Active' },
                            PUBLIC_VCARD_PROJECTION
                        ).lean().maxTimeMS(4000);

                        if (freshClient) {
                            if (!freshClient.resume || typeof freshClient.resume !== 'object') {
                                freshClient.resume = {
                                    enabled: false,
                                    fileUrl: '',
                                    fileName: '',
                                    objectKey: '',
                                    accessCode: '',
                                    passwordHash: '',
                                    passwordLastGeneratedAt: null,
                                };
                            }

                            if (!freshClient.analytics || typeof freshClient.analytics !== 'object') {
                                freshClient.analytics = {
                                    profileViews: 0,
                                    resumeViews: 0,
                                    resumeDownloads: 0,
                                };
                            }

                            setCachedPublicVcard(slug, mapClientForResponse(freshClient));
                        }
                    }
                } catch (cacheRefreshError) {
                    logger.warn({ err: cacheRefreshError, slug }, 'Background public vCard refresh failed');
                }
            });

            return;
        }

        const client = await Client.findOne(
            { slug, status: 'Active' },
            PUBLIC_VCARD_PROJECTION
        ).lean().maxTimeMS(4000);

        if (!client) {
            return respError(res, 'Card profile is currently inactive or missing.', 404);
        }

        if (!client.resume || typeof client.resume !== 'object') {
            client.resume = {
                enabled: false,
                fileUrl: '',
                fileName: '',
                objectKey: '',
                accessCode: '',
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

        const payload = mapClientForResponse(client);
        setCachedPublicVcard(slug, payload);
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        respSuccess(res, payload, 'Profile loaded successfully.');

        setImmediate(() => {
            incrementClientAnalytics(client._id, 'profileViews');
        });
    } catch (error) {
        const slug = String(req.params.slug || '').trim().toLowerCase();
        const cached = getCachedPublicVcard(slug);

        if (cached && cached.payload) {
            logger.warn({ err: error, slug }, 'Serving stale public vCard cache after database failure');
            res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
            return respSuccess(res, cached.payload, 'Profile loaded successfully (stale cache).');
        }

        return respError(res, 'Failed to load public vCard.', 503, null, error);
    }
});

app.post('/api/vcard/:slug/resume-access', publicLimiter, async (req, res) => {
    try {
        if (!ensureDatabaseReady(res)) return;
        const slug = String(req.params.slug || '').trim();
        const password = String(req.body && req.body.password || '').trim();
        const mode = String(req.body && req.body.mode || 'view').trim().toLowerCase();

        if (!password) return respError(res, 'Resume password is required.', 400);
        if (!['view', 'download'].includes(mode)) return respError(res, 'Invalid resume access mode.', 400);

        let client = await Client.findOne({ slug, status: 'Active' });
        if (!client) return respError(res, 'Client not found.', 404);

        client = await repairLegacyResumeField(client);
        if (!client) return respError(res, 'Client not found after resume repair.', 404);

        ensureResumeDefaults(client);
        client.markModified('resume');

        if (String(client.packageType || 'standard').toLowerCase() !== 'pro') {
            return respError(res, 'Resume access is available on PRO profiles only.', 403);
        }

        if (!client.resume.enabled || !client.resume.fileUrl || !client.resume.passwordHash) {
            return respError(res, 'Resume is not configured for this profile.', 404);
        }

        if (!verifySecret(password, client.resume.passwordHash)) {
            return respError(res, 'Incorrect resume password.', 403);
        }

        const fileUrl = String(client.resume.fileUrl || '').trim();
        const fileName = String(client.resume.fileName || 'resume.pdf').trim() || 'resume.pdf';

        if (!/^https?:\/\//i.test(fileUrl)) {
            return respError(res, 'Resume file URL is invalid.', 500);
        }

        await incrementClientAnalytics(client._id, mode === 'download' ? 'resumeDownloads' : 'resumeViews');        const downloadUrl = `${APP_BASE_URL}/api/vcard/${encodeURIComponent(slug)}/resume-download?password=${encodeURIComponent(password)}`;

        return respSuccess(res, {
            fileUrl,
            fileName,
            mode,
            downloadUrl,
        }, 'Resume access granted.');
    } catch (error) {
        return respError(
            res,
            error && error.message ? error.message : 'Failed to verify resume access.',
            500,
            null,
            error
        );
    }
});

app.get('/api/vcard/:slug/resume-download', publicLimiter, async (req, res) => {
    try {
        if (!ensureDatabaseReady(res)) return;

        const slug = String(req.params.slug || '').trim();
        const password = String(req.query && req.query.password || '').trim();

        if (!password) return respError(res, 'Resume password is required.', 400);

        let client = await Client.findOne({ slug, status: 'Active' });
        if (!client) return respError(res, 'Client not found.', 404);

        client = await repairLegacyResumeField(client);
        if (!client) return respError(res, 'Client not found after resume repair.', 404);

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

        const fileUrl = String(client.resume.fileUrl || '').trim();
        const fileName = String(client.resume.fileName || 'resume.pdf').trim() || 'resume.pdf';

        const upstream = await fetch(fileUrl);
        if (!upstream.ok) {
            return respError(res, 'Failed to fetch resume file.', 502);
        }

        await incrementClientAnalytics(client._id, 'resumeDownloads');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
        res.setHeader('Cache-Control', 'no-store');

        upstream.body.pipe(res);
    } catch (error) {
        return respError(res, 'Failed to download resume.', 500, null, error);
    }
});
app.post('/api/clients/:id/resume-regenerate-password', publicLimiter, async (req, res) => {
    try {
        if (!ensureDatabaseReady(res)) return;
        let client = await Client.findById(req.params.id);
        if (!client) return respError(res, 'Client not found.', 404);

        client = await repairLegacyResumeField(client);
        if (!client) return respError(res, 'Client not found after resume repair.', 404);

        ensureResumeDefaults(client);
        client.markModified('resume');

        if (String(client.packageType || 'standard').toLowerCase() !== 'pro') {
            return respError(res, 'Resume password regeneration is available on PRO profiles only.', 403);
        }

        if (!client.resume.enabled || !client.resume.fileUrl) {
            return respError(res, 'Resume is not configured for this profile.', 400);
        }

        const generatedResumePassword = generateFourDigitPassword();
        client.resume.accessCode = generatedResumePassword;
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

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use(express.static(staticPath, {
    extensions: ['html'],
    etag: true,
    lastModified: true,
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return;
        }

        if (/\.(js|css)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            return;
        }

        if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
    },
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


















