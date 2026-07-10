const express = require('express');
const router = express.Router();
const passport = require('passport');

// @desc Auth with Google
// @route GET /auth/google
router.get('/google', (req, res, next) => {
    if (!passport._strategies.google) {
        return res.status(501).send("Google OAuth is not configured on this server. Please use local email/password login.");
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// @desc Google auth callback
// @route GET /auth/google/callback
router.get('/google/callback', (req, res, next) => {
    if (!passport._strategies.google) {
        return res.redirect('/');
    }
    passport.authenticate('google', { failureRedirect: '/' })(req, res, next);
}, (req, res) => {
    res.redirect('/');
});

router.get('/status', (req, res) => {
    if (req.isAuthenticated()) {
        const safeUser = {
            _id: req.user._id,
            fullName: req.user.fullName,
            email: req.user.email,
            image: req.user.image,
            preferences: req.user.preferences
        };
        res.json({ authenticated: true, user: safeUser });
    } else {
        res.json({ authenticated: false });
    }
});

router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
        
        req.session.destroy((err) => {
            if (err) return res.status(500).json({ success: false, message: 'Session destruction failed' });
            res.clearCookie('wanderai.sid'); // Updated to match custom session name in app.js
            res.json({ success: true, message: 'Logged out' });
        });
    });
});

module.exports = router;
