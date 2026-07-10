const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const ensureAuth = require('../middleware/auth');
const { validateRegistration } = require('../middleware/validate');

// 1. REGISTER
router.post('/register', validateRegistration, userController.registerUser);

// 2. LOGIN
router.post('/login', userController.loginUser);

// 3. Get user profile/preferences
router.get('/profile', ensureAuth, userController.getProfile);
// Alias: /me
router.get('/me', ensureAuth, userController.getProfile);

// 4. Save preferences (Veg/Non-Veg, Currency, etc.)
router.put('/update-profile', ensureAuth, userController.updatePreferences);
// Alias: /update-preferences (used by profile.html)
router.put('/update-preferences', ensureAuth, userController.updatePreferences);

// 5. Update profile picture
router.put('/update-profile-picture', ensureAuth, userController.updateProfilePicture);


module.exports = router;