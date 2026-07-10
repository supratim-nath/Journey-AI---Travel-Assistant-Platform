const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // Path A: Local Login
    fullName: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String }, // This will be hashed/encrypted

    // Path B: Google Login
    googleId: { type: String, unique: true, sparse: true },

    // Common Profile Info
    displayName: String,
    image: String,

    // Your existing preferences logic
    preferences: {
        diet: { type: String, default: 'None' },
        currency: { type: String, default: 'INR' },
        pace: { type: String, default: 'Balanced' },
        language: { type: String, default: 'English' }
    },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);