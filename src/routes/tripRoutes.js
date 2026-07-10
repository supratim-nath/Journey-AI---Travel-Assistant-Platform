const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const ensureAuth = require('../middleware/auth');
const { validateTrip } = require('../middleware/validate');

// 0. Fetch Unsplash Image Proxy
router.get('/image/unsplash', tripController.getUnsplashImage);

// 1. Generate the preview (No DB save)
router.post('/generate-preview', validateTrip, tripController.generatePreview);

// 2. Save the trip (User clicks 'Save') - Requires Login
router.post('/save', ensureAuth, tripController.saveTrip);

// 3. Get all saved trips for the gallery - Requires Login
router.get('/all-saved', ensureAuth, tripController.getAllSavedTrips);

// 4. Get a specific saved trip by ID - Requires Auth
router.get('/:id', ensureAuth, tripController.getTripById);

// 5. Get a shared trip by ID (Public, no authentication required)
router.get('/shared/:id', tripController.getSharedTrip);

// 6. Update a specific saved trip by ID - Requires Auth
router.put('/:id', ensureAuth, tripController.updateTrip);

// 7. Delete a specific saved trip by ID - Requires Auth
router.delete('/:id', ensureAuth, tripController.deleteTrip);

module.exports = router;