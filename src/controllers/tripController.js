const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const aiService = require('../services/aiService');

/**
 * Warm up AI backend
 */
exports.warmupAI = async (req, res) => {
    try {
        const AI_URL = process.env.AI_BACKEND_URL || 'http://localhost:8000';
        const raw_ai_url = AI_URL.endsWith('/') ? AI_URL.slice(0, -1) : AI_URL;
        fetch(`${raw_ai_url}/api/health`).catch(() => {});
        res.json({ success: true, message: "AI warmup request dispatched." });
    } catch (e) {
        res.json({ success: true, message: "AI warmup skipped." });
    }
};

/**
 * 0. GET UNSPLASH IMAGE (SECURE PROXY)
 * Returns a high-res cover photo URL without exposing the API key to the client.
 */
exports.getUnsplashImage = async (req, res) => {
    const query = req.query.query || '';
    const queryLower = query.toLowerCase();
    
    // Choose beautiful fallback image based on keywords
    let fallbackUrl = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=800"; // default landscape
    if (queryLower.includes("goa") || queryLower.includes("beach") || queryLower.includes("sea")) {
        fallbackUrl = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800";
    } else if (queryLower.includes("udaipur") || queryLower.includes("jaipur") || queryLower.includes("rajasthan") || queryLower.includes("palace") || queryLower.includes("fort")) {
        fallbackUrl = "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&q=80&w=800";
    } else if (queryLower.includes("munnar") || queryLower.includes("kerala") || queryLower.includes("tea") || queryLower.includes("green")) {
        fallbackUrl = "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&q=80&w=800";
    } else if (queryLower.includes("manali") || queryLower.includes("himachal") || queryLower.includes("snow") || queryLower.includes("mountain")) {
        fallbackUrl = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=800";
    } else if (queryLower.includes("mumbai") || queryLower.includes("bombay")) {
        fallbackUrl = "https://images.unsplash.com/photo-1566552881560-0be862a7c445?auto=format&fit=crop&q=80&w=800";
    } else if (queryLower.includes("delhi")) {
        fallbackUrl = "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&q=80&w=800";
    } else if (queryLower.includes("varanasi") || queryLower.includes("ganga") || queryLower.includes("temple")) {
        fallbackUrl = "https://images.unsplash.com/photo-1561361058-c24cecae35ca?auto=format&fit=crop&q=80&w=800";
    }

    try {
        if (!query) return res.json({ success: true, url: fallbackUrl });

        const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
        if (!unsplashKey) {
            console.warn("⚠️ Missing Unsplash API Key. Returning local fallback image.");
            return res.json({ success: true, url: fallbackUrl });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        let response;
        try {
            response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&client_id=${unsplashKey}&per_page=1`, {
                signal: controller.signal
            });
        } catch (fetchErr) {
            clearTimeout(timeout);
            throw fetchErr;
        }
        clearTimeout(timeout);

        if (!response.ok) {
            console.warn(`⚠️ Unsplash API returned status ${response.status}. Returning local fallback image.`);
            return res.json({ success: true, url: fallbackUrl });
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            return res.json({ success: true, url: data.results[0].urls.regular });
        }
        res.json({ success: true, url: fallbackUrl });
    } catch (error) {
        console.warn("⚠️ Unsplash API call failed. Returning local fallback image. Error:", error.message);
        res.json({ success: true, url: fallbackUrl });
    }
};

/**
 * 1. GENERATE PREVIEW
 * Called when the user clicks "Generate" on create-trip.html.
 * This does NOT save to the database yet.
 */
exports.generatePreview = async (req, res) => {
    try {
        const { destination, days, budget, vibe, traveler_type } = req.body;

        // Call the AI service (or the mock service for now)
        const generatedPlan = await aiService.generateItinerary({
            destination,
            days,
            budget,
            vibe,
            traveler_type
        });

        // Send the data back to the frontend to be stored in sessionStorage
        res.status(200).json({
            success: true,
            data: {
                destination,
                days,
                budget,
                vibe,
                itineraryData: generatedPlan
            }
        });
    } catch (error) {
        console.error("Error in generatePreview:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. SAVE TRIP - Called when the user clicks the "Save" button on the itinerary page.
exports.saveTrip = async (req, res) => {
    try {
        const { destination, days, vibe, itineraryData } = req.body;

        // Request Validation
        if (!destination || typeof destination !== 'string' || destination.trim().length < 2) {
            return res.status(400).json({ success: false, message: "Destination must be at least 2 characters." });
        }
        const parsedDays = parseInt(days, 10);
        if (isNaN(parsedDays) || parsedDays < 1 || parsedDays > 30) {
            return res.status(400).json({ success: false, message: "Days must be between 1 and 30." });
        }
        if (!itineraryData || typeof itineraryData !== 'object' || !itineraryData.schedule) {
            return res.status(400).json({ success: false, message: "Valid itineraryData with schedule is required." });
        }

        let numericBudget = req.body.budget;
        if (typeof numericBudget === 'string') {
            const lowerObj = numericBudget.toLowerCase();
            if (lowerObj.includes('economy')) {
                numericBudget = 5000;
            } else if (lowerObj.includes('luxury')) {
                numericBudget = 50000;
            } else {
                const parsed = parseInt(numericBudget.replace(/[^0-9]/g, ''), 10);
                numericBudget = isNaN(parsed) ? 15000 : parsed;
            }
        } else if (typeof numericBudget !== 'number') {
            numericBudget = 15000; // default standard
        }

        // Create a new trip document using the data sent from the frontend
        const newTrip = new Trip({
            destination: destination.trim(),
            days: parsedDays,
            budget: numericBudget,
            vibe: vibe || '',
            user: req.user._id, // Strong reference via ObjectId
            userEmail: req.user.email, // Kept for quick lookups
            itineraryData: itineraryData 
        });

        const savedTrip = await newTrip.save();

        res.status(201).json({
            success: true,
            message: "Trip saved successfully!",
            tripId: savedTrip._id
        });
    } catch (error) {
        console.error("Error in saveTrip:", error);
        res.status(500).json({ success: false, message: "Failed to save trip. Make sure you are logged in." });
    }
};

/**
 * 3. GET ALL SAVED TRIPS
 */
exports.getAllSavedTrips = async (req, res) => {
    try {
        // Fetch trips belonging only to the current logged-in user
        const trips = await Trip.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: trips
        });
    } catch (error) {
        console.error("Error in getAllSavedTrips:", error);
        res.status(500).json({ success: false, message: "Error fetching saved trips." });
    }
};

/**
 * 4. GET TRIP BY ID
 */
exports.getTripById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid trip ID format." });
        }

        const trip = await Trip.findById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({ success: false, message: "Trip not found" });
        }

        // AUTHORIZATION: Ensure the trip belongs to the current user
        if (trip.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized: This is not your trip." });
        }

        res.status(200).json({
            success: true,
            data: trip
        });
    } catch (error) {
        console.error("Error in getTripById:", error);
        res.status(500).json({ success: false, message: "Error retrieving trip data." });
    }
};

/**
 * 5. GET SHARED TRIP BY ID (PUBLIC)
 * Returns the trip data without enforcing user-ownership check.
 */
exports.getSharedTrip = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid trip ID format." });
        }

        const trip = await Trip.findById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({ success: false, message: "Trip not found" });
        }

        res.status(200).json({
            success: true,
            data: trip
        });
    } catch (error) {
        console.error("Error in getSharedTrip:", error);
        res.status(500).json({ success: false, message: "Error retrieving shared trip data." });
    }
};

/**
 * 6. UPDATE SAVED TRIP BY ID
 */
exports.updateTrip = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid trip ID format." });
        }

        const trip = await Trip.findById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({ success: false, message: "Trip not found" });
        }

        // AUTHORIZATION: Ensure the trip belongs to the current user
        if (trip.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized: This is not your trip." });
        }

        // Update fields — use explicit undefined checks so falsy values (0, '') correctly overwrite
        if (req.body.destination !== undefined) trip.destination = req.body.destination;
        if (req.body.days !== undefined) trip.days = req.body.days;
        if (req.body.budget !== undefined) trip.budget = req.body.budget;
        if (req.body.vibe !== undefined) trip.vibe = req.body.vibe;
        if (req.body.itineraryData !== undefined) trip.itineraryData = req.body.itineraryData;
        trip.markModified('itineraryData');

        const updatedTrip = await trip.save();

        res.status(200).json({
            success: true,
            message: "Trip updated successfully!",
            tripId: updatedTrip._id
        });
    } catch (error) {
        console.error("Error in updateTrip:", error);
        res.status(500).json({ success: false, message: "Failed to update trip details." });
    }
};

/**
 * 7. DELETE SAVED TRIP BY ID
 */
exports.deleteTrip = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid trip ID format." });
        }

        const trip = await Trip.findById(req.params.id);
        
        if (!trip) {
            return res.status(404).json({ success: false, message: "Trip not found" });
        }

        // AUTHORIZATION: Ensure the trip belongs to the current user
        if (trip.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized: This is not your trip." });
        }

        await Trip.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Trip deleted successfully!"
        });
    } catch (error) {
        console.error("Error in deleteTrip:", error);
        res.status(500).json({ success: false, message: "Failed to delete trip." });
    }
};