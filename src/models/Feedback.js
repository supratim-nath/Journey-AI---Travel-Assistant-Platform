const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 500 },
    tripDestination: { type: String, default: '' }, // Trip destination shown in review card
    pageUrl: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Index to optimize verified testimonials queries (rating >= 4 sorted by newest)
FeedbackSchema.index({ rating: -1, createdAt: -1 });

module.exports = mongoose.model('Feedback', FeedbackSchema);
