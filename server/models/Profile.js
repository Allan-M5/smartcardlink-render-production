// server/models/Profile.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProfileSchema = new Schema({
  name: { type: String, required: true },
  title: { type: String }, // e.g., CEO, Founder
  company: { type: String },
  
  // Phones and emails
  phone1: { type: String },
  phone2: { type: String },
  phone3: { type: String },
  email1: { type: String },
  email2: { type: String },
  email3: { type: String },
  
  photoURL: { type: String }, // Profile photo
  
  bio: { type: String },
  businessWebsite: { type: String },
  portfolioWebsite: { type: String },
  locationMapURL: { type: String },
  
  socialLinks: {
    facebook: String,
    instagram: String,
    x: String,
    linkedin: String,
    tiktok: String,
    youtube: String
  },
  
  workingHours: {
    monFriStart: String,
    monFriEnd: String,
    satStart: String,
    satEnd: String,
    sunStart: String,
    sunEnd: String
  },
  
  cardDesign: { type: String }, // Selected design
  card_url: { type: String },   // Generated card URL (if any)
  
  createdAt: { type: Date, default: Date.now }
});

// Prevent model overwrite error in watch mode / nodemon
module.exports = mongoose.models.Profile || mongoose.model('Profile', ProfileSchema);
