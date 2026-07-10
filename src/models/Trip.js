const mongoose = require('mongoose');

const TripSchema = new mongoose.Schema({
    destination: { type: String, required: true },
    days: { type: Number, required: true },
    budget: { type: Number, required: true },
    vibe: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: { type: String }, // keeping for backward compatibility
    itineraryData: { type: Object, default: {} },
    chatHistory: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
});

// Compound index to optimize dashboard sorting and search
TripSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Trip', TripSchema);