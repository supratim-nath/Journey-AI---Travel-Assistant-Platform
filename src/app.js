const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');

// Start-up Environment Variable Validation
const REQUIRED_ENV_VARS = ['MONGO_URI', 'AI_BACKEND_URL'];
const OPTIONAL_ENV_VARS = ['PORT', 'SESSION_SECRET', 'UNSPLASH_ACCESS_KEY', 'ORS_API_KEY', 'OPENWEATHERMAP_API_KEY', 'NEWS_API_KEY', 'GEMINI_API_KEY'];

console.log('🔍 [JourneyAI Startup] Checking environment variables...');
const missingRequired = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingRequired.length > 0) {
    console.error(`❌ [JourneyAI Startup] Missing REQUIRED environment variables: ${missingRequired.join(', ')}`);
    console.error('Please configure these variables in your .env file or environment variables before running the application.');
    process.exit(1);
} else {
    console.log('✅ [JourneyAI Startup] All required environment variables are present.');
}

const missingOptional = OPTIONAL_ENV_VARS.filter(v => !process.env[v]);
if (missingOptional.length > 0) {
    console.warn(`⚠️ [JourneyAI Startup] Missing OPTIONAL environment variables: ${missingOptional.join(', ')}`);
    console.warn('Some enrichment features (Unsplash images, OpenRouteService maps, OpenWeatherMap forecast, News) will fall back to local mocks/free layers.');
}

const connectDB = require('./config/db');
require('./config/passport')(passport); // Import the passport config we discussed

const tripRoutes = require('./routes/tripRoutes');
const userRoutes = require('./routes/userRoutes');
const { sanitizeInput } = require('./middleware/validate');

const app = express();

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});

// Connect to database
connectDB();

// A02: Warn loudly in production if SESSION_SECRET is still the fallback value
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('[SECURITY] SESSION_SECRET is not set! Set a strong secret in your environment variables before deploying.');
}

// Middleware
const allowedOrigins = [
    'http://localhost:5001',
    'http://127.0.0.1:5001',
    process.env.PRODUCTION_URL
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl) or matching allowed list
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
})); // Allows your HTML files to talk to this server

// Security Headers for Production-Grade Architecture (Helmet-equivalent CSP + HSTS)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://kit.fontawesome.com https://cdn.tailwindcss.com https://*.fontawesome.com; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
        "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://images.unsplash.com https://*.unsplash.com https://api.dicebear.com https://*.dicebear.com https://dicebear.com https://authjs.dev https://*.googleusercontent.com https://*.wikipedia.org https://*.wikimedia.org https://*.flagcdn.com; " +
        "connect-src 'self' http://localhost:5001 http://127.0.0.1:5001 http://localhost:8000 https://nominatim.openstreetmap.org https://api.open-meteo.com https://ka-f.fontawesome.com https://*.wikipedia.org https://*.wikimedia.org https://*.basemaps.cartocdn.com https://unpkg.com; " +
        "font-src 'self' https://fonts.gstatic.com https://ka-f.fontawesome.com https://cdnjs.cloudflare.com; " +
        "frame-ancestors 'none';"
    );
    next();
});

app.use(express.json()); // Allows server to read JSON data from your forms
app.use(sanitizeInput); // Prevent NoSQL Injection attacks by sanitizing request bodies, query parameters, and URL parameters

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const staticPath = path.resolve(__dirname, '../html files');
app.use(express.static(staticPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});


// 1. Session Middleware
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // enable trust proxy for cloud load balancers (Render, Railway, etc.)
}

const mongoStore = MongoStore.create({
    clientPromise: new Promise((resolve, reject) => {
        if (mongoose.connection.readyState === 1) {
            resolve(mongoose.connection.getClient());
        } else {
            const onConnected = () => {
                resolve(mongoose.connection.getClient());
            };
            mongoose.connection.once('connected', onConnected);
            
            // Timeout after 5 seconds to prevent hanging the Express requests
            setTimeout(() => {
                mongoose.connection.off('connected', onConnected);
                reject(new Error("MongoDB connection timeout for session store"));
            }, 5000);
        }
    }),
    ttl: 2 * 24 * 60 * 60 // 2 days
});

mongoStore.on('error', function (error) {
    console.warn('\n⚠️ Session Store Warning: Cannot connect to MongoDB. Express will fallback to MemoryStore-like behavior for session handling to prevent request hanging.');
});

app.use(session({
    name: 'wanderai.sid', // custom name instead of default connect.sid
    secret: process.env.SESSION_SECRET || 'wander_ai_fallback_secret',
    resave: false,
    saveUninitialized: false,
    store: mongoStore,
    rolling: true, // refreshes the session on each request
    cookie: {
        maxAge: 1000 * 60 * 60 * 48, // 48 hours
        httpOnly: true, // prevents client-side access to cookies
        secure: process.env.NODE_ENV === 'production', // set to true if using HTTPS in production
        sameSite: 'lax' // prevents CSRF in most common scenarios
    }
}));

// 2. Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// 3. AI Intelligence Proxy (Avoids CORS and hardcoded Python URLs in frontend)
const raw_ai_url = process.env.AI_BACKEND_URL || 'http://localhost:8000';
const AI_BACKEND_URL = raw_ai_url.endsWith('/') ? raw_ai_url.slice(0, -1) : raw_ai_url;

const rateLimits = {};

// A07: Periodically purge expired rate-limit IP entries to prevent memory leak
setInterval(() => {
    const now = Date.now();
    const windowMs = 60 * 1000;
    for (const ip of Object.keys(rateLimits)) {
        rateLimits[ip] = rateLimits[ip].filter(ts => now - ts < windowMs);
        if (rateLimits[ip].length === 0) delete rateLimits[ip];
    }
}, 5 * 60 * 1000); // run every 5 minutes

const rateLimitMiddleware = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 20; // 20 requests/min limit

    if (!rateLimits[ip]) {
        rateLimits[ip] = [];
    }

    // Clean up old timestamps
    rateLimits[ip] = rateLimits[ip].filter(timestamp => now - timestamp < windowMs);

    if (rateLimits[ip].length >= maxRequests) {
        return res.status(429).json({ 
            success: false, 
            message: "Rate limit exceeded. Ritu is catching her breath! Please wait 60 seconds." 
        });
    }

    rateLimits[ip].push(now);
    next();
};
app.post('/chat', rateLimitMiddleware, async (req, res) => {
    try {
        const { tripId, message, current_itinerary, session_id } = req.body;
        let dbHistory = null;
        let trip = null;

        const Trip = require('./models/Trip');
        if (tripId && mongoose.Types.ObjectId.isValid(tripId)) {
            trip = await Trip.findById(tripId);
            if (trip) {
                if (!req.user || trip.user.toString() !== req.user._id.toString()) {
                    return res.status(403).json({ success: false, message: 'Unauthorized: This trip does not belong to you.' });
                }
                dbHistory = trip.chatHistory || [];
            }
        }

        let itineraryPayload = trip ? trip.itineraryData : current_itinerary;
        if (itineraryPayload && typeof itineraryPayload === 'object') {
            itineraryPayload = { ...itineraryPayload };
            if (req.user && req.user.preferences) {
                itineraryPayload.user_preferences = req.user.preferences;
            }
        }

        const backendBody = {
            session_id,
            message,
            current_itinerary: itineraryPayload,
            history: dbHistory
        };

        let data;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 55000); // 55s AI timeout

            const response = await fetch(`${AI_BACKEND_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backendBody),
                signal: controller.signal
            });
            clearTimeout(timeout);
            data = await response.json();
        } catch (err) {
            console.warn("🔄 Python backend down/failed. Falling back to local JS chat assistant. Error:", err.message);
            
            const userMsgLower = message.toLowerCase();
            let reply = "Hello! I am Ritu, your travel companion. I am currently running in offline mode, but I can still help you modify your trip!";
            let itinerary_updates = [];
            let replace_all = false;
            
            // Handle add/visit place
            const addMatch = message.match(/(?:add|visit)\s+(?:a visit to\s+)?(.*?)\s+(?:on|to|in)\s+day\s+(\d+)/i) || message.match(/add\s+(.*?)\s+day\s+(\d+)/i);
            if (addMatch) {
                let place = addMatch[1].trim();
                const dayNum = parseInt(addMatch[2]);
                place = place.replace(/^(a visit to|to|on)\s+/i, "").trim().replace(/[.,?! ]+$/, "");
                if (!place.startsWith("**")) place = `**${place}**`;
                
                reply = `Added ${place} to Day ${dayNum}!`;
                itinerary_updates.push({
                    day: dayNum,
                    activity: `Explore ${place} for a custom sightseeing session.`
                });
            }
            
            // Handle delete/remove day (response only, actual DB update is handled below)
            const deleteMatch = message.match(/(?:delete|remove)\s+day\s+(\d+)/i);
            if (deleteMatch) {
                const dayToDelete = parseInt(deleteMatch[1]);
                reply = `Removed Day ${dayToDelete} and re-aligned the subsequent days.`;
            }
            
            // Handle general keywords
            if (userMsgLower.includes("food") || userMsgLower.includes("eat") || userMsgLower.includes("restaurant") || userMsgLower.includes("cafe")) {
                reply = "In offline mode, I recommend checking out popular local eateries. Let me know if you want to add a specific spot to your itinerary!";
            } else if (userMsgLower.includes("hotel") || userMsgLower.includes("stay") || userMsgLower.includes("accommodation")) {
                reply = "For your accommodation, I suggest staying near the city center to save travel time. Let me know if you'd like to add your hotel to the itinerary!";
            } else if (userMsgLower.includes("weather") || userMsgLower.includes("pack") || userMsgLower.includes("wear")) {
                reply = "I recommend packing comfortable clothes, walking shoes, and checking the weather forecast before you depart!";
            } else if (userMsgLower.includes("safe") || userMsgLower.includes("safety") || userMsgLower.includes("tips")) {
                reply = "Keep your valuables safe, drink bottled water, and always agree on taxi/auto fares beforehand.";
            }
            
            data = {
                response: reply,
                itinerary_updates: itinerary_updates.length > 0 ? itinerary_updates : null,
                replace_all: replace_all
            };
        }

        // Save back to DB if trip exists
        if (trip && data.response) {
            trip.chatHistory.push({ role: 'user', content: message });
            trip.chatHistory.push({ role: 'assistant', content: data.response });

            let schedule = trip.itineraryData.schedule || [];
            let scheduleChanged = false;

            const deleteMatch = message.match(/(?:delete|remove)\s+day\s+(\d+)/i);
            if (deleteMatch) {
                const dayToDelete = parseInt(deleteMatch[1]);
                const originalLength = schedule.length;
                schedule = schedule.filter(d => d.day !== dayToDelete);
                // Shift subsequent days down
                schedule.forEach(d => {
                    if (d.day > dayToDelete) {
                        d.day -= 1;
                    }
                });
                if (schedule.length !== originalLength) {
                    scheduleChanged = true;
                }
            } else if (data.itinerary_updates && data.itinerary_updates.length > 0) {
                if (data.replace_all) {
                    schedule = data.itinerary_updates.map(update => ({
                        day: update.day,
                        activity: update.activity,
                        location: trip.destination
                    }));
                } else {
                    const scheduleMap = {};
                    schedule.forEach(d => {
                        scheduleMap[d.day] = d;
                    });

                    data.itinerary_updates.forEach(update => {
                        const existingDay = scheduleMap[update.day];
                        scheduleMap[update.day] = {
                            day: update.day,
                            activity: update.activity,
                            location: existingDay ? existingDay.location : trip.destination
                        };
                    });

                    schedule = Object.keys(scheduleMap)
                        .map(k => scheduleMap[k])
                        .sort((a, b) => a.day - b.day);
                }
                scheduleChanged = true;
            }

            if (scheduleChanged) {
                trip.itineraryData.schedule = schedule;
                trip.days = schedule.length;
            }
            trip.markModified('chatHistory');
            trip.markModified('itineraryData');
            await trip.save();
        }

        res.json(data);
    } catch (err) {
        console.error("Chat Proxy Root Error:", err);
        res.status(500).json({ success: false, message: `System error in chat pipeline: ${err.message}` });
    }
});


app.post('/suggestions', rateLimitMiddleware, async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    try {
        const response = await fetch(`${AI_BACKEND_URL}/suggestions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: controller.signal
        });
        clearTimeout(timeout);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        clearTimeout(timeout);
        console.warn("⚠️ AI Backend suggestions down or failed. Using local JS suggestions fallback. Error:", err.message);
        
        const history = req.body.history || [];
        const query = req.body.query || "";
        const combinedSearch = (history.join(" ") + " " + query).toLowerCase();
        let fallbackData;
        
        if (combinedSearch.includes("goa")) {
            fallbackData = {
                hidden_gems: [
                    { title: "Tambdi Surla Temple", description: "12th-century stone temple hidden in the Western Ghats jungle.", icon: "fa-monument" },
                    { title: "Cola Beach Lagoon", description: "A quiet freshwater lagoon meeting the sea in South Goa.", icon: "fa-water" }
                ],
                food_recommendations: [
                    { title: "Goan Fish Curry Rice", description: "Traditional spicy coconut fish curry with red rice.", icon: "fa-bowl-rice" },
                    { title: "Bebinca", description: "Rich 7-layered traditional Indo-Portuguese dessert.", icon: "fa-utensils" }
                ]
            };
        } else if (combinedSearch.includes("munnar") || combinedSearch.includes("kerala")) {
            fallbackData = {
                hidden_gems: [
                    { title: "Kolukkumalai", description: "The world's highest organic tea estate near Munnar.", icon: "fa-leaf" },
                    { title: "Varkala Cliff", description: "Spectacular red cliffs overlooking the Arabian Sea in Varkala.", icon: "fa-mountain" }
                ],
                food_recommendations: [
                    { title: "Kerala Karimeen", description: "Pearl spot fish marinated in spices and grilled in banana leaves.", icon: "fa-utensils" },
                    { title: "Sadya", description: "Traditional multi-course vegetarian banquet served on banana leaf.", icon: "fa-bowl-rice" }
                ]
            };
        } else if (combinedSearch.includes("udaipur") || combinedSearch.includes("jaipur") || combinedSearch.includes("rajasthan")) {
            fallbackData = {
                hidden_gems: [
                    { title: "Bahubali Hills", description: "Stunning viewpoint overlooking Badi Lake in Udaipur.", icon: "fa-mountain" },
                    { title: "Galta Ji Monkey Temple", description: "Sacred temple complex with natural springs and friendly monkeys.", icon: "fa-monument" }
                ],
                food_recommendations: [
                    { title: "Dal Baati Churma", description: "Authentic Rajasthani wheat balls served with ghee and lentils.", icon: "fa-bowl-rice" },
                    { title: "Pyaaz Kachori", description: "Crispy deep-fried pastry stuffed with spicy onions.", icon: "fa-utensils" }
                ]
            };
        } else {
            fallbackData = {
                hidden_gems: [
                    { title: "Bahubali Hills", description: "Stunning viewpoint overlooking Badi Lake in Udaipur.", icon: "fa-mountain" },
                    { title: "Tambdi Surla Temple", description: "12th-century stone temple hidden in the Western Ghats jungle in Goa.", icon: "fa-monument" }
                ],
                food_recommendations: [
                    { title: "Dal Baati Churma", description: "Authentic Rajasthani wheat balls served with ghee and lentils.", icon: "fa-bowl-rice" },
                    { title: "Goan Fish Curry Rice", description: "Traditional spicy coconut fish curry with red rice.", icon: "fa-utensils" }
                ]
            };
        }
        res.json(fallbackData);
    }
});

app.post('/api/feedback', async (req, res) => {
    try {
        const { rating, comment, pageUrl, tripDestination } = req.body;
        const userId = req.user ? req.user._id : null;
        
        const Feedback = require('./models/Feedback');
        const newFeedback = new Feedback({
            user: userId,
            rating: Number(rating),
            comment,
            pageUrl,
            tripDestination: tripDestination || ''
        });
        await newFeedback.save();
        res.json({ success: true, message: 'Thank you for your feedback!' });
    } catch (err) {
        console.error("Feedback Save Error:", err);
        res.status(500).json({ success: false, message: 'Failed to record feedback.' });
    }
});

app.get('/api/feedback', async (req, res) => {
    try {
        const Feedback = require('./models/Feedback');
        const feedbacks = await Feedback.find({ rating: { $gte: 4 } })
            .sort({ createdAt: -1 })
            .limit(6)
            .populate('user', 'fullName name image');
        res.json({ success: true, feedbacks });
    } catch (err) {
        console.error("Feedback Fetch Error:", err);
        res.status(500).json({ success: false, message: 'Failed to fetch feedback.' });
    }
});

const GEOCODE_CACHE = {
    // Andaman & Nicobar
    "andaman": [{"lat": "11.7401", "lon": "92.6586", "display_name": "Andaman and Nicobar Islands, India"}],
    "port blair": [{"lat": "11.6234", "lon": "92.7265", "display_name": "Port Blair, Andaman and Nicobar Islands, India"}],
    "havelock island": [{"lat": "11.9761", "lon": "92.9876", "display_name": "Swaraj Dweep (Havelock Island), Andaman and Nicobar Islands, India"}],
    "havelock": [{"lat": "11.9761", "lon": "92.9876", "display_name": "Swaraj Dweep (Havelock Island), Andaman and Nicobar Islands, India"}],
    "swaraj dweep": [{"lat": "11.9761", "lon": "92.9876", "display_name": "Swaraj Dweep (Havelock Island), Andaman and Nicobar Islands, India"}],
    "neil island": [{"lat": "11.8322", "lon": "93.0478", "display_name": "Shaheed Dweep (Neil Island), Andaman and Nicobar Islands, India"}],
    "neil": [{"lat": "11.8322", "lon": "93.0478", "display_name": "Shaheed Dweep (Neil Island), Andaman and Nicobar Islands, India"}],
    "shaheed dweep": [{"lat": "11.8322", "lon": "93.0478", "display_name": "Shaheed Dweep (Neil Island), Andaman and Nicobar Islands, India"}],
    "radhanagar beach": [{"lat": "11.9839", "lon": "92.9575", "display_name": "Radhanagar Beach, Swaraj Dweep, Andaman and Nicobar Islands, India"}],
    "elephant beach": [{"lat": "12.0011", "lon": "92.9554", "display_name": "Elephant Beach, Swaraj Dweep, Andaman and Nicobar Islands, India"}],
    "cellular jail": [{"lat": "11.6738", "lon": "92.7478", "display_name": "Cellular Jail National Memorial, Port Blair, Andaman and Nicobar Islands, India"}],
    "ross island": [{"lat": "11.6775", "lon": "92.7661", "display_name": "Netaji Subhash Chandra Bose Island (Ross Island), Andaman, India"}],
    "netaji subhash chandra bose island": [{"lat": "11.6775", "lon": "92.7661", "display_name": "Netaji Subhash Chandra Bose Island (Ross Island), Andaman, India"}],
    "chidiya tapu": [{"lat": "11.5032", "lon": "92.7054", "display_name": "Chidiya Tapu View Point, Port Blair, Andaman, India"}],
    "laxmanpur beach": [{"lat": "11.8344", "lon": "93.0232", "display_name": "Laxmanpur Beach, Shaheed Dweep, Andaman, India"}],
    "bharatpur beach": [{"lat": "11.8441", "lon": "93.0485", "display_name": "Bharatpur Beach, Shaheed Dweep, Andaman, India"}],
    "sitapur beach": [{"lat": "11.8210", "lon": "93.0560", "display_name": "Sitapur Beach, Shaheed Dweep, Andaman, India"}],
    "baratang island": [{"lat": "12.1167", "lon": "92.7833", "display_name": "Baratang Island, Middle Andaman, India"}],
    "baratang": [{"lat": "12.1167", "lon": "92.7833", "display_name": "Baratang Island, Middle Andaman, India"}],
    "mayabunder": [{"lat": "12.9234", "lon": "92.8978", "display_name": "Mayabunder, Middle and North Andaman, India"}],
    "rangat": [{"lat": "12.5022", "lon": "92.9056", "display_name": "Rangat, Middle Andaman, India"}],
    "diglipur": [{"lat": "13.2667", "lon": "92.9667", "display_name": "Diglipur, North Andaman, India"}],

    // Jaisalmer
    "jaisalmer": [{"lat": "26.9157", "lon": "70.9083", "display_name": "Jaisalmer, Rajasthan, India"}],
    "jaisalmer fort": [{"lat": "26.9128", "lon": "70.9126", "display_name": "Jaisalmer Fort, Jaisalmer, Rajasthan, India"}],
    "sam sand dunes": [{"lat": "26.8920", "lon": "70.5100", "display_name": "Sam Sand Dunes, Jaisalmer, Rajasthan, India"}],
    "gadisar lake": [{"lat": "26.9095", "lon": "70.9234", "display_name": "Gadisar Lake, Jaisalmer, Rajasthan, India"}],
    "patwon ki haveli": [{"lat": "26.9154", "lon": "70.9124", "display_name": "Patwon Ki Haveli, Jaisalmer, Rajasthan, India"}],
    "kuldhara ghost village": [{"lat": "26.8712", "lon": "70.7856", "display_name": "Kuldhara Abandoned Village, Jaisalmer, Rajasthan, India"}],
    "kuldhara": [{"lat": "26.8712", "lon": "70.7856", "display_name": "Kuldhara Abandoned Village, Jaisalmer, Rajasthan, India"}],
    "desert national park": [{"lat": "26.4764", "lon": "70.3667", "display_name": "Desert National Park, Jaisalmer, Rajasthan, India"}],

    // Meghalaya
    "meghalaya": [{"lat": "25.4670", "lon": "91.3662", "display_name": "Meghalaya, India"}],
    "shillong": [{"lat": "25.5788", "lon": "91.8831", "display_name": "Shillong, Meghalaya, India"}],
    "cherrapunji": [{"lat": "25.2702", "lon": "91.7323", "display_name": "Cherrapunji (Sohra), Meghalaya, India"}],
    "sohra": [{"lat": "25.2702", "lon": "91.7323", "display_name": "Cherrapunji (Sohra), Meghalaya, India"}],
    "living root bridge": [{"lat": "25.2494", "lon": "91.6661", "display_name": "Double Decker Living Root Bridge, Nongriat, Cherrapunji, Meghalaya, India"}],
    "double decker living root bridge": [{"lat": "25.2494", "lon": "91.6661", "display_name": "Double Decker Living Root Bridge, Nongriat, Cherrapunji, Meghalaya, India"}],
    "dawki river": [{"lat": "25.1983", "lon": "92.0194", "display_name": "Umngot River (Dawki River), Dawki, Jaintia Hills, Meghalaya, India"}],
    "dawki": [{"lat": "25.1983", "lon": "92.0194", "display_name": "Umngot River (Dawki River), Dawki, Jaintia Hills, Meghalaya, India"}],
    "umngot river": [{"lat": "25.1983", "lon": "92.0194", "display_name": "Umngot River (Dawki River), Dawki, Jaintia Hills, Meghalaya, India"}],
    "nohkalikai falls": [{"lat": "25.2755", "lon": "91.6853", "display_name": "Nohkalikai Falls, Cherrapunji, Meghalaya, India"}],
    "mawlynnong": [{"lat": "25.2017", "lon": "91.9036", "display_name": "Mawlynnong (Cleanest Village in Asia), East Khasi Hills, Meghalaya, India"}],
    "mawsynram": [{"lat": "25.2975", "lon": "91.5826", "display_name": "Mawsynram (Wettest Place on Earth), East Khasi Hills, Meghalaya, India"}],
    "krang suri falls": [{"lat": "25.3340", "lon": "92.5180", "display_name": "Krang Suri Waterfalls, Jowai, West Jaintia Hills, Meghalaya, India"}],

    // Food Spots & Local Specialties
    "goan fish curry rice": [{"lat": "15.5562", "lon": "73.7523", "display_name": "Britto's Restaurant (Goan Fish Curry), Baga Beach, Goa, India"}],
    "bebinca": [{"lat": "15.4989", "lon": "73.8078", "display_name": "Viva Panjim (Traditional Bebinca), Fontainhas, Goa, India"}],
    "prawn balchao": [{"lat": "15.4989", "lon": "73.8078", "display_name": "Viva Panjim (Prawn Balchao), Fontainhas, Goa, India"}],
    "chicken xacuti": [{"lat": "15.5562", "lon": "73.7523", "display_name": "Britto's Restaurant (Chicken Xacuti), Baga, Goa, India"}],
    "dal baati churma": [{"lat": "26.8754", "lon": "75.7723", "display_name": "Laxmi Mishthan Bhandar (Dal Baati Churma), Jaipur, India"}],
    "pyaaz kachori": [{"lat": "26.9124", "lon": "75.7873", "display_name": "Rawat Mishthan Bhandar (Pyaaz Kachori), Jaipur, India"}],
    "lal maas": [{"lat": "24.5674", "lon": "73.6665", "display_name": "Ambrai Restaurant (Lal Maas), Udaipur, India"}],
    "gatte ki sabzi": [{"lat": "26.9154", "lon": "75.7893", "display_name": "Albert Hall Cafe (Gatte ki Sabzi), Jaipur, India"}],
    "kerala karimeen": [{"lat": "9.4981", "lon": "76.3388", "display_name": "Kalan Masala Restaurant (Karimeen Pollichathu), Alleppey, India"}],
    "karimeen pollichathu": [{"lat": "9.4981", "lon": "76.3388", "display_name": "Kalan Masala Restaurant (Karimeen Pollichathu), Alleppey, India"}],
    "sadya": [{"lat": "10.8505", "lon": "76.2711", "display_name": "Traditional Kerala Sadya Feast, Alleppey, India"}],
    "kerala sadya": [{"lat": "10.8505", "lon": "76.2711", "display_name": "Traditional Kerala Sadya Feast, Alleppey, India"}],
    "malabar parotta and beef curry": [{"lat": "9.9816", "lon": "76.2711", "display_name": "Grand Pavilion (Malabar Parotta & Beef Curry), Kochi, Kerala, India"}],
    "munnar cardamom tea": [{"lat": "10.0889", "lon": "77.0595", "display_name": "Munnar Tea Gardens Fresh Cardamom Tea, Munnar, India"}],
    "andaman lobster delight": [{"lat": "11.6234", "lon": "92.7265", "display_name": "Seafood Dhaba (Andaman Lobster), Port Blair, Andaman, India"}],
    "lobster curry": [{"lat": "11.6234", "lon": "92.7265", "display_name": "Seafood Dhaba (Andaman Lobster), Port Blair, Andaman, India"}],
    "coconut prawn curry": [{"lat": "11.9761", "lon": "92.9876", "display_name": "Something Different Cafe (Coconut Prawn Curry), Havelock Island, Andaman, India"}],
    "ladoh": [{"lat": "25.5788", "lon": "91.8831", "display_name": "Trattoria Restaurant (Jadoh & Dohneiiong), Police Bazar, Shillong, India"}],
    "jadoh": [{"lat": "25.5788", "lon": "91.8831", "display_name": "Trattoria Restaurant (Jadoh & Dohneiiong), Police Bazar, Shillong, India"}],
    "dohneiiong": [{"lat": "25.5788", "lon": "91.8831", "display_name": "Trattoria Restaurant (Jadoh & Dohneiiong), Police Bazar, Shillong, India"}],
    "pukhlein": [{"lat": "25.2702", "lon": "91.7323", "display_name": "Local Khasi Tea Stall (Pukhlein Sweet), Cherrapunji, India"}],
    "siddu": [{"lat": "32.2516", "lon": "77.1677", "display_name": "Siddu Point, Old Manali, Himachal Pradesh, India"}],
    "pan-fried trout": [{"lat": "32.2516", "lon": "77.1677", "display_name": "Johnson's Cafe (Himachali Trout), Manali, India"}],
    "madra": [{"lat": "32.2336", "lon": "77.2047", "display_name": "Sher-e-Punjab Restaurant (Chana Madra), Mall Road, Manali, India"}],
    "tamatar chaat": [{"lat": "25.2836", "lon": "83.0099", "display_name": "Deena Chaat Bhandar (Tamatar Chaat), Varanasi, India"}],
    "blue lassi": [{"lat": "25.2676", "lon": "82.9459", "display_name": "Blue Lassi Shop, Varanasi, India"}],
    "kachori sabzi": [{"lat": "25.2996", "lon": "82.9939", "display_name": "Ram Bhandar (Kachori Sabzi), Varanasi, India"}],
    "vada pav": [{"lat": "19.0760", "lon": "72.8777", "display_name": "Aram Vada Pav, CST, Mumbai, India"}],
    "pav bhaji": [{"lat": "19.0660", "lon": "72.8617", "display_name": "Sardar Refreshments (Butter Pav Bhaji), Tardeo, Mumbai, India"}],
    "berry pulav": [{"lat": "19.0590", "lon": "72.9257", "display_name": "Britannia & Co. Restaurant (Berry Pulav), Ballard Estate, Mumbai, India"}],
    "mughlai mutton korma": [{"lat": "28.6139", "lon": "77.2090", "display_name": "Karim's Restaurant, Jama Masjid, Old Delhi, India"}],
    "aloo parantha": [{"lat": "28.7041", "lon": "77.1025", "display_name": "Paranthe Wali Gali, Chandni Chowk, Delhi, India"}],
    "dal bukhara": [{"lat": "28.6139", "lon": "77.2090", "display_name": "Bukhara Restaurant (ITC Maurya), New Delhi, India"}],

    "goa": [{"lat": "15.2993", "lon": "74.1240", "display_name": "Goa, India"}],
    "udaipur": [{"lat": "24.5854", "lon": "73.7125", "display_name": "Udaipur, Rajasthan, India"}],
    "jaipur": [{"lat": "26.9124", "lon": "75.7873", "display_name": "Jaipur, Rajasthan, India"}],
    "leh": [{"lat": "34.1526", "lon": "77.5771", "display_name": "Leh, Ladakh, India"}],
    "ladakh": [{"lat": "34.1526", "lon": "77.5771", "display_name": "Leh, Ladakh, India"}],
    "mumbai": [{"lat": "19.0760", "lon": "72.8777", "display_name": "Mumbai, Maharashtra, India"}],
    "delhi": [{"lat": "28.7041", "lon": "77.1025", "display_name": "Delhi, India"}],
    "new delhi": [{"lat": "28.6139", "lon": "77.2090", "display_name": "New Delhi, Delhi, India"}],
    "varanasi": [{"lat": "25.3176", "lon": "82.9739", "display_name": "Varanasi, Uttar Pradesh, India"}],
    "munnar": [{"lat": "10.0889", "lon": "77.0595", "display_name": "Munnar, Kerala, India"}],
    "alleppey": [{"lat": "9.4981", "lon": "76.3388", "display_name": "Alappuzha (Alleppey), Kerala, India"}],
    "kerala": [{"lat": "10.8505", "lon": "76.2711", "display_name": "Kerala, India"}],
    "aguada fort": [{"lat": "15.4925", "lon": "73.7738", "display_name": "Aguada Fort, Candolim, Goa, India"}],
    "ahar cenotaphs": [{"lat": "24.5744", "lon": "73.7585", "display_name": "ahar cenotaphs (Estimated location), udaipur, India"}],
    "albert hall museum": [{"lat": "26.9154", "lon": "75.7893", "display_name": "albert hall museum (Estimated location), jaipur, India"}],
    "alchi kitchen": [{"lat": "34.1596", "lon": "77.5901", "display_name": "alchi kitchen (Estimated location), ladakh, India"}],
    "alleppey houseboat cruise": [{"lat": "10.8255", "lon": "76.2371", "display_name": "alleppey houseboat cruise (Estimated location), kerala, India"}],
    "ambrai ghat": [{"lat": "24.5674", "lon": "73.6665", "display_name": "ambrai ghat (Estimated location), udaipur, India"}],
    "amer fort": [{"lat": "26.9084", "lon": "75.8153", "display_name": "amer fort (Estimated location), jaipur, India"}],
    "amrapali museum": [{"lat": "26.9314", "lon": "75.8223", "display_name": "amrapali museum (Estimated location), jaipur, India"}],
    "anjuna flea market": [{"lat": "15.5728", "lon": "73.7431", "display_name": "Anjuna Flea Market, Goa, India"}],
    "anokhi cafe": [{"lat": "26.9374", "lon": "75.7473", "display_name": "anokhi cafe (Estimated location), jaipur, India"}],
    "arambol sweet water lake": [{"lat": "15.6892", "lon": "73.6999", "display_name": "Arambol Sweet Water Lake, Arambol, Goa, India"}],
    "assi ghat aarti": [{"lat": "25.3626", "lon": "82.9449", "display_name": "assi ghat aarti (Estimated location), varanasi, India"}],
    "athirappilly waterfalls": [{"lat": "10.8185", "lon": "76.3171", "display_name": "athirappilly waterfalls (Estimated location), kerala, India"}],
    "baga beach": [{"lat": "15.5553", "lon": "73.7517", "display_name": "Baga Beach, Goa, India"}],
    "bagore ki haveli": [{"lat": "24.5484", "lon": "73.7175", "display_name": "bagore ki haveli (Estimated location), udaipur, India"}],
    "bahubali hills": [{"lat": "24.5614", "lon": "73.7275", "display_name": "bahubali hills (Estimated location), udaipur, India"}],
    "banarasi silk bazaar": [{"lat": "25.3246", "lon": "82.9889", "display_name": "banarasi silk bazaar (Estimated location), varanasi, India"}],
    "bandra bandstand": [{"lat": "19.0670", "lon": "72.8517", "display_name": "bandra bandstand (Estimated location), mumbai, India"}],
    "bandra-worli sea link": [{"lat": "19.0710", "lon": "72.8447", "display_name": "bandra-worli sea link (Estimated location), mumbai, India"}],
    "bar palladio": [{"lat": "26.9614", "lon": "75.8093", "display_name": "bar palladio (Estimated location), jaipur, India"}],
    "basilica of bom jesus": [{"lat": "15.5009", "lon": "73.9116", "display_name": "Basilica of Bom Jesus, Old Goa, Goa, India"}],
    "beas river rafting": [{"lat": "32.2436", "lon": "77.2027", "display_name": "beas river rafting (Estimated location), manali, India"}],
    "bharat kala bhavan": [{"lat": "25.3106", "lon": "82.9829", "display_name": "bharat kala bhavan (Estimated location), varanasi, India"}],
    "birla mandir": [{"lat": "26.9614", "lon": "75.7983", "display_name": "birla mandir (Estimated location), jaipur, India"}],
    "blue lassi shop": [{"lat": "25.2676", "lon": "82.9459", "display_name": "blue lassi shop (Estimated location), varanasi, India"}],
    "britannia & co restaurant": [{"lat": "19.0590", "lon": "72.9257", "display_name": "britannia & co restaurant (Estimated location), mumbai, India"}],
    "britto's restaurant": [{"lat": "15.5562", "lon": "73.7523", "display_name": "Britto's Restaurant, Baga, Goa, India"}],
    "brown bread bakery": [{"lat": "25.2816", "lon": "82.9799", "display_name": "brown bread bakery (Estimated location), varanasi, India"}],
    "cabo de rama fort": [{"lat": "15.0886", "lon": "73.9189", "display_name": "Cabo de Rama Fort, Canacona, Goa, India"}],
    "cafe 1947": [{"lat": "32.2036", "lon": "77.1697", "display_name": "cafe 1947 (Estimated location), manali, India"}],
    "calangute beach": [{"lat": "15.5496", "lon": "73.7535", "display_name": "Calangute Beach, Goa, India"}],
    "chapora fort": [{"lat": "15.6062", "lon": "73.7360", "display_name": "Chapora Fort, Vagator, Goa, India"}],
    "cherai beach": [{"lat": "10.8615", "lon": "76.2461", "display_name": "cherai beach (Estimated location), kerala, India"}],
    "chhatrapati shivaji terminus": [{"lat": "19.0480", "lon": "72.8637", "display_name": "chhatrapati shivaji terminus (Estimated location), mumbai, India"}],
    "chicham bridge": [{"lat": "32.1896", "lon": "77.2187", "display_name": "chicham bridge (Estimated location), manali, India"}],
    "chokhi dhani": [{"lat": "26.8804", "lon": "75.8153", "display_name": "chokhi dhani (Estimated location), jaipur, India"}],
    "city palace udaipur": [{"lat": "24.6064", "lon": "73.6755", "display_name": "city palace udaipur (Estimated location), udaipur, India"}],
    "colaba causeway": [{"lat": "19.1040", "lon": "72.8427", "display_name": "colaba causeway (Estimated location), mumbai, India"}],
    "colva beach": [{"lat": "15.2755", "lon": "73.9100", "display_name": "Colva Beach, Salcete, Goa, India"}],
    "crawford market": [{"lat": "19.0780", "lon": "72.8847", "display_name": "crawford market (Estimated location), mumbai, India"}],
    "curlies beach shack": [{"lat": "15.5761", "lon": "73.7402", "display_name": "Curlies Beach Shack, South Anjuna, Goa, India"}],
    "darjeeling cafe varkala": [{"lat": "10.8365", "lon": "76.2961", "display_name": "darjeeling cafe varkala (Estimated location), kerala, India"}],
    "dashashwamedh ghat": [{"lat": "25.3416", "lon": "82.9579", "display_name": "dashashwamedh ghat (Estimated location), varanasi, India"}],
    "deena chaat bhandar": [{"lat": "25.2836", "lon": "83.0099", "display_name": "deena chaat bhandar (Estimated location), varanasi, India"}],
    "dharavi guided tour": [{"lat": "19.0490", "lon": "72.8417", "display_name": "dharavi guided tour (Estimated location), mumbai, India"}],
    "diskit monastery": [{"lat": "34.1766", "lon": "77.6261", "display_name": "diskit monastery (Estimated location), ladakh, India"}],
    "dropadi restaurant": [{"lat": "15.0080", "lon": "74.0229", "display_name": "Dropadi Restaurant, Palolem Beach, Goa, India"}],
    "dudhsagar falls": [{"lat": "15.3185", "lon": "74.3142", "display_name": "Dudhsagar Falls, Sanguem, Goa, India"}],
    "durga kund temple": [{"lat": "25.3636", "lon": "82.9649", "display_name": "durga kund temple (Estimated location), varanasi, India"}],
    "eklingji temple": [{"lat": "24.5894", "lon": "73.7465", "display_name": "eklingji temple (Estimated location), udaipur, India"}],
    "elco pani puri": [{"lat": "19.1210", "lon": "72.8497", "display_name": "elco pani puri (Estimated location), mumbai, India"}],
    "elephanta caves": [{"lat": "19.1240", "lon": "72.9167", "display_name": "elephanta caves (Estimated location), mumbai, India"}],
    "eravikulam national park": [{"lat": "10.8315", "lon": "76.2551", "display_name": "eravikulam national park (Estimated location), kerala, India"}],
    "fateh sagar lake": [{"lat": "24.6284", "lon": "73.7575", "display_name": "fateh sagar lake (Estimated location), udaipur, India"}],
    "fisherman's wharf": [{"lat": "15.2285", "lon": "73.9405", "display_name": "The Fisherman's Wharf, Mobor Beach, Goa, India"}],
    "fontainhas latin quarter": [{"lat": "15.4989", "lon": "73.8078", "display_name": "Fontainhas, Panaji, Goa, India"}],
    "fort kochi chinese nets": [{"lat": "10.8025", "lon": "76.2951", "display_name": "fort kochi chinese nets (Estimated location), kerala, India"}],
    "galta ji monkey temple": [{"lat": "26.9564", "lon": "75.7463", "display_name": "galta ji monkey temple (Estimated location), jaipur, India"}],
    "ganga river cruise": [{"lat": "25.2746", "lon": "82.9409", "display_name": "ganga river cruise (Estimated location), varanasi, India"}],
    "gangaur ghat": [{"lat": "24.6284", "lon": "73.6765", "display_name": "gangaur ghat (Estimated location), udaipur, India"}],
    "gateway of india": [{"lat": "19.1040", "lon": "72.8557", "display_name": "gateway of india (Estimated location), mumbai, India"}],
    "gesmo restaurant": [{"lat": "34.1806", "lon": "77.5701", "display_name": "gesmo restaurant (Estimated location), ladakh, India"}],
    "girgaon chowpatty": [{"lat": "19.0660", "lon": "72.8617", "display_name": "girgaon chowpatty (Estimated location), mumbai, India"}],
    "great himalayan national park": [{"lat": "32.2386", "lon": "77.2337", "display_name": "great himalayan national park (Estimated location), manali, India"}],
    "hadimba devi temple": [{"lat": "32.2846", "lon": "77.2177", "display_name": "hadimba devi temple (Estimated location), manali, India"}],
    "haji ali dargah": [{"lat": "19.0570", "lon": "72.8407", "display_name": "haji ali dargah (Estimated location), mumbai, India"}],
    "halais restaurant": [{"lat": "10.8855", "lon": "76.2631", "display_name": "halais restaurant (Estimated location), kerala, India"}],
    "haldighati museum": [{"lat": "24.5444", "lon": "73.6785", "display_name": "haldighati museum (Estimated location), udaipur, India"}],
    "hawa mahal": [{"lat": "26.8964", "lon": "75.8243", "display_name": "hawa mahal (Estimated location), jaipur, India"}],
    "hemis monastery": [{"lat": "34.1026", "lon": "77.5721", "display_name": "hemis monastery (Estimated location), ladakh, India"}],
    "himachal culture museum": [{"lat": "32.1966", "lon": "77.2097", "display_name": "himachal culture museum (Estimated location), manali, India"}],
    "hunder sand dunes": [{"lat": "34.1176", "lon": "77.5501", "display_name": "hunder sand dunes (Estimated location), ladakh, India"}],
    "jag mandir palace": [{"lat": "24.6244", "lon": "73.6695", "display_name": "jag mandir palace (Estimated location), udaipur, India"}],
    "jagdish temple": [{"lat": "24.6344", "lon": "73.7155", "display_name": "jagdish temple (Estimated location), udaipur, India"}],
    "jaigarh fort": [{"lat": "26.9034", "lon": "75.8213", "display_name": "jaigarh fort (Estimated location), jaipur, India"}],
    "jaipur city palace": [{"lat": "26.8824", "lon": "75.7623", "display_name": "jaipur city palace (Estimated location), jaipur, India"}],
    "jaisamand lake": [{"lat": "24.5364", "lon": "73.6715", "display_name": "jaisamand lake (Estimated location), udaipur, India"}],
    "jal mahal": [{"lat": "26.9304", "lon": "75.8353", "display_name": "jal mahal (Estimated location), jaipur, India"}],
    "jantar mantar": [{"lat": "26.9074", "lon": "75.7513", "display_name": "jantar mantar (Estimated location), jaipur, India"}],
    "jogini waterfalls": [{"lat": "32.2686", "lon": "77.2337", "display_name": "jogini waterfalls (Estimated location), manali, India"}],
    "johnson's cafe": [{"lat": "32.2516", "lon": "77.1677", "display_name": "johnson's cafe (Estimated location), manali, India"}],
    "juhu beach": [{"lat": "19.0410", "lon": "72.8937", "display_name": "juhu beach (Estimated location), mumbai, India"}],
    "kachori gali": [{"lat": "25.2996", "lon": "82.9939", "display_name": "kachori gali (Estimated location), varanasi, India"}],
    "kalan masala restaurant": [{"lat": "10.8535", "lon": "76.3131", "display_name": "kalan masala restaurant (Estimated location), kerala, India"}],
    "kanheri caves": [{"lat": "19.0360", "lon": "72.8627", "display_name": "kanheri caves (Estimated location), mumbai, India"}],
    "karni mata ropeway": [{"lat": "24.5664", "lon": "73.7535", "display_name": "karni mata ropeway (Estimated location), udaipur, India"}],
    "kashi art cafe": [{"lat": "10.8685", "lon": "76.3201", "display_name": "kashi art cafe (Estimated location), kerala, India"}],
    "kashi vishwanath temple": [{"lat": "25.3416", "lon": "83.0179", "display_name": "kashi vishwanath temple (Estimated location), varanasi, India"}],
    "kasol market": [{"lat": "32.2436", "lon": "77.2207", "display_name": "kasol market (Estimated location), manali, India"}],
    "kathakali center": [{"lat": "10.8715", "lon": "76.2811", "display_name": "kathakali center (Estimated location), kerala, India"}],
    "kedar ghat": [{"lat": "25.2886", "lon": "82.9329", "display_name": "kedar ghat (Estimated location), varanasi, India"}],
    "khardung la pass": [{"lat": "34.1826", "lon": "77.6121", "display_name": "khardung la pass (Estimated location), ladakh, India"}],
    "kovalam beach": [{"lat": "10.8685", "lon": "76.2871", "display_name": "kovalam beach (Estimated location), kerala, India"}],
    "kumily market": [{"lat": "10.8135", "lon": "76.2891", "display_name": "kumily market (Estimated location), kerala, India"}],
    "la plage restaurant": [{"lat": "15.6375", "lon": "73.7199", "display_name": "La Plage, Ashwem Beach, Mandrem, Goa, India"}],
    "lake pichola boat ride": [{"lat": "24.5924", "lon": "73.7395", "display_name": "lake pichola boat ride (Estimated location), udaipur, India"}],
    "lalok cafe": [{"lat": "34.1446", "lon": "77.5701", "display_name": "lalok cafe (Estimated location), ladakh, India"}],
    "laxmi mishthan bhandar": [{"lat": "26.8754", "lon": "75.7723", "display_name": "laxmi mishthan bhandar (Estimated location), jaipur, India"}],
    "leh main bazaar": [{"lat": "34.1756", "lon": "77.5371", "display_name": "leh main bazaar (Estimated location), ladakh, India"}],
    "leh palace": [{"lat": "34.1116", "lon": "77.5441", "display_name": "leh palace (Estimated location), ladakh, India"}],
    "leopold cafe": [{"lat": "19.0780", "lon": "72.8587", "display_name": "leopold cafe (Estimated location), mumbai, India"}],
    "magnetic hill": [{"lat": "34.1396", "lon": "77.6131", "display_name": "magnetic hill (Estimated location), ladakh, India"}],
    "mall road manali": [{"lat": "32.2336", "lon": "77.2047", "display_name": "mall road manali (Estimated location), manali, India"}],
    "mandovi river cruise": [{"lat": "15.5015", "lon": "73.8290", "display_name": "Mandovi River Cruise, Panaji, Goa, India"}],
    "mangueshi temple": [{"lat": "15.4439", "lon": "73.9686", "display_name": "Mangueshi Temple, Priol, Goa, India"}],
    "manikaran sahib gurudwara": [{"lat": "32.2466", "lon": "77.1667", "display_name": "manikaran sahib gurudwara (Estimated location), manali, India"}],
    "manikarnika ghat": [{"lat": "25.2776", "lon": "83.0119", "display_name": "manikarnika ghat (Estimated location), varanasi, India"}],
    "manu temple": [{"lat": "32.2116", "lon": "77.1877", "display_name": "manu temple (Estimated location), manali, India"}],
    "marine drive": [{"lat": "19.0620", "lon": "72.8967", "display_name": "marine drive (Estimated location), mumbai, India"}],
    "martin's corner": [{"lat": "15.2917", "lon": "73.9089", "display_name": "Martin's Corner, Betalbatim, Goa, India"}],
    "masala chowk": [{"lat": "26.8674", "lon": "75.7603", "display_name": "masala chowk (Estimated location), jaipur, India"}],
    "mattupetty dam": [{"lat": "10.8395", "lon": "76.3031", "display_name": "mattupetty dam (Estimated location), kerala, India"}],
    "morjim beach": [{"lat": "15.6146", "lon": "73.7335", "display_name": "Morjim Beach, Pernem, Goa, India"}],
    "munnar tea gardens": [{"lat": "10.8555", "lon": "76.2471", "display_name": "munnar tea gardens (Estimated location), kerala, India"}],
    "naggar castle": [{"lat": "32.2216", "lon": "77.2217", "display_name": "naggar castle (Estimated location), manali, India"}],
    "nahargarh fort": [{"lat": "26.9074", "lon": "75.7663", "display_name": "nahargarh fort (Estimated location), jaipur, India"}],
    "natraj dining hall": [{"lat": "24.5894", "lon": "73.7595", "display_name": "natraj dining hall (Estimated location), udaipur, India"}],
    "old manali café gali": [{"lat": "32.2246", "lon": "77.2027", "display_name": "old manali caf\u00e9 gali (Estimated location), manali, India"}],
    "padmanabhaswamy temple": [{"lat": "10.8015", "lon": "76.2401", "display_name": "padmanabhaswamy temple (Estimated location), kerala, India"}],
    "palolem beach": [{"lat": "15.0100", "lon": "74.0232", "display_name": "Palolem Beach, Canacona, Goa, India"}],
    "pangong tso lake": [{"lat": "34.1076", "lon": "77.5361", "display_name": "pangong tso lake (Estimated location), ladakh, India"}],
    "papanasam beach": [{"lat": "10.8975", "lon": "76.2251", "display_name": "papanasam beach (Estimated location), kerala, India"}],
    "patrika gate": [{"lat": "26.8694", "lon": "75.7383", "display_name": "patrika gate (Estimated location), jaipur, India"}],
    "periyar wildlife sanctuary": [{"lat": "10.8525", "lon": "76.2641", "display_name": "periyar wildlife sanctuary (Estimated location), kerala, India"}],
    "pizzeria vaatika cafe": [{"lat": "25.2856", "lon": "82.9589", "display_name": "pizzeria vaatika cafe (Estimated location), varanasi, India"}],
    "ramnagar fort": [{"lat": "25.3036", "lon": "82.9299", "display_name": "ramnagar fort (Estimated location), varanasi, India"}],
    "rawat mishthan bhandar": [{"lat": "26.9194", "lon": "75.8273", "display_name": "rawat mishthan bhandar (Estimated location), jaipur, India"}],
    "reis magos fort": [{"lat": "15.4965", "lon": "73.8093", "display_name": "Reis Magos Fort, Bardez, Goa, India"}],
    "rohtang pass": [{"lat": "32.2656", "lon": "77.1997", "display_name": "rohtang pass (Estimated location), manali, India"}],
    "sadya": [{"lat": "10.8905", "lon": "76.2621", "display_name": "sadya (Estimated location), kerala, India"}],
    "sahakari spice farm": [{"lat": "15.4322", "lon": "74.0205", "display_name": "Sahakari Spice Farm, Ponda, Goa, India"}],
    "saheliyon ki bari": [{"lat": "24.5474", "lon": "73.6865", "display_name": "saheliyon ki bari (Estimated location), udaipur, India"}],
    "sajjangarh biological park": [{"lat": "24.6034", "lon": "73.7265", "display_name": "sajjangarh biological park (Estimated location), udaipur, India"}],
    "sajjangarh monsoon palace": [{"lat": "24.5494", "lon": "73.7405", "display_name": "sajjangarh monsoon palace (Estimated location), udaipur, India"}],
    "sangam confluence": [{"lat": "34.1636", "lon": "77.5341", "display_name": "sangam confluence (Estimated location), ladakh, India"}],
    "sanjay gandhi national park": [{"lat": "19.1010", "lon": "72.9267", "display_name": "sanjay gandhi national park (Estimated location), mumbai, India"}],
    "sanjay sharma museum": [{"lat": "26.9364", "lon": "75.8233", "display_name": "sanjay sharma museum (Estimated location), jaipur, India"}],
    "sankat mochan temple": [{"lat": "25.2706", "lon": "82.9349", "display_name": "sankat mochan temple (Estimated location), varanasi, India"}],
    "sarnath buddhist site": [{"lat": "25.3166", "lon": "82.9839", "display_name": "sarnath buddhist site (Estimated location), varanasi, India"}],
    "sethan valley": [{"lat": "32.2376", "lon": "77.1477", "display_name": "sethan valley (Estimated location), manali, India"}],
    "shanti stupa": [{"lat": "34.1586", "lon": "77.6111", "display_name": "shanti stupa (Estimated location), ladakh, India"}],
    "shey palace": [{"lat": "34.1296", "lon": "77.5711", "display_name": "shey palace (Estimated location), ladakh, India"}],
    "shilpgram craft village": [{"lat": "24.5944", "lon": "73.6775", "display_name": "shilpgram craft village (Estimated location), udaipur, India"}],
    "siddhivinayak temple": [{"lat": "19.0290", "lon": "72.8527", "display_name": "siddhivinayak temple (Estimated location), mumbai, India"}],
    "sisodia rani ka bagh": [{"lat": "26.8884", "lon": "75.8293", "display_name": "sisodia rani ka bagh (Estimated location), jaipur, India"}],
    "solang ropeway": [{"lat": "32.2806", "lon": "77.1987", "display_name": "solang ropeway (Estimated location), manali, India"}],
    "solang valley": [{"lat": "32.1986", "lon": "77.2077", "display_name": "solang valley (Estimated location), manali, India"}],
    "spangmik village": [{"lat": "34.1726", "lon": "77.5481", "display_name": "spangmik village (Estimated location), ladakh, India"}],
    "stok palace museum": [{"lat": "34.1576", "lon": "77.5911", "display_name": "stok palace museum (Estimated location), ladakh, India"}],
    "tapri the tea house": [{"lat": "26.9054", "lon": "75.8103", "display_name": "tapri the tea house (Estimated location), jaipur, India"}],
    "thekkady spice plantation": [{"lat": "10.8915", "lon": "76.2451", "display_name": "thekkady spice plantation (Estimated location), kerala, India"}],
    "thiksey monastery": [{"lat": "34.1176", "lon": "77.5291", "display_name": "thiksey monastery (Estimated location), ladakh, India"}],
    "tibetan monastery manali": [{"lat": "32.2466", "lon": "77.1737", "display_name": "tibetan monastery manali (Estimated location), manali, India"}],
    "tinto market": [{"lat": "15.4989", "lon": "73.8122", "display_name": "Tinto Market, Panaji, Goa, India"}],
    "tso moriri lake": [{"lat": "34.1096", "lon": "77.6091", "display_name": "tso moriri lake (Estimated location), ladakh, India"}],
    "tulsi ghat": [{"lat": "25.2706", "lon": "82.9589", "display_name": "tulsi ghat (Estimated location), varanasi, India"}],
    "upre by 1559 ad": [{"lat": "24.6034", "lon": "73.7565", "display_name": "upre by 1559 ad (Estimated location), udaipur, India"}],
    "van vihar park": [{"lat": "32.2066", "lon": "77.1957", "display_name": "van vihar park (Estimated location), manali, India"}],
    "varkala cliff": [{"lat": "10.8465", "lon": "76.2621", "display_name": "varkala cliff (Estimated location), kerala, India"}],
    "vashisht hot springs": [{"lat": "32.2226", "lon": "77.1427", "display_name": "vashisht hot springs (Estimated location), manali, India"}],
    "vembanad lake": [{"lat": "10.8755", "lon": "76.2911", "display_name": "vembanad lake (Estimated location), kerala, India"}],
    "vintage car museum": [{"lat": "24.5874", "lon": "73.6875", "display_name": "vintage car museum (Estimated location), udaipur, India"}],
    "kanchenjunga": [{"lat": "27.7025", "lon": "88.1475", "display_name": "Kangchenjunga, Sikkim, India"}],
    "tiger hill": [{"lat": "26.9904", "lon": "88.2917", "display_name": "Tiger Hill, Darjeeling, West Bengal, India"}],
    "darjeeling": [{"lat": "27.0360", "lon": "88.2627", "display_name": "Darjeeling, West Bengal, India"}],
    "ghoom monastery": [{"lat": "27.0157", "lon": "88.2475", "display_name": "Ghoom Monastery, Darjeeling, West Bengal, India"}],
    "batasia loop": [{"lat": "27.0168", "lon": "88.2472", "display_name": "Batasia Loop, Darjeeling, West Bengal, India"}],
    "happy valley tea estate": [{"lat": "27.0531", "lon": "88.2520", "display_name": "Happy Valley Tea Estate, Darjeeling, West Bengal, India"}],
    "darjeeling ropeway": [{"lat": "27.0583", "lon": "88.2541", "display_name": "Darjeeling Ropeway, Darjeeling, West Bengal, India"}],
    "himalayan mountaineering institute": [{"lat": "27.0594", "lon": "88.2687", "display_name": "Himalayan Mountaineering Institute, Darjeeling, West Bengal, India"}],
    "padmaja naidu himalayan zoological park": [{"lat": "27.0596", "lon": "88.2690", "display_name": "Padmaja Naidu Himalayan Zoological Park, Darjeeling, West Bengal, India"}],
    "peace pagoda": [{"lat": "27.0294", "lon": "88.2558", "display_name": "Peace Pagoda, Darjeeling, West Bengal, India"}],
    "rock garden": [{"lat": "27.0272", "lon": "88.2323", "display_name": "Rock Garden, Darjeeling, West Bengal, India"}],
    "sikkim": [{"lat": "27.5330", "lon": "88.5122", "display_name": "Sikkim, India"}],
    "gangtok": [{"lat": "27.3314", "lon": "88.6138", "display_name": "Gangtok, Sikkim, India"}]
};

app.get('/api/geocode', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, message: "Query parameter 'q' is required" });
        }
        
        const normQ = q.trim().toLowerCase();
        
        // 1. Check in-memory pre-seeded cache first with normalization (resolves instantly & bypasses rate limits)
        if (GEOCODE_CACHE[normQ]) {
            console.log(`[Geocode Cache Exact Hit] "${q}"`);
            res.setHeader('X-Cache', 'HIT');
            return res.json(GEOCODE_CACHE[normQ]);
        }

        const cleanQ = normQ.replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/\bindia\b/g, '').trim();
        let cacheMatch = null;
        for (const key of Object.keys(GEOCODE_CACHE)) {
            const cleanKey = key.replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/\bindia\b/g, '').trim();
            if (cleanQ === cleanKey || (cleanKey.length >= 4 && (cleanQ.includes(cleanKey) || cleanKey.includes(cleanQ)))) {
                cacheMatch = GEOCODE_CACHE[key];
                break;
            }
        }
        if (cacheMatch) {
            console.log(`[Geocode Cache Normalized Hit] "${q}"`);
            res.setHeader('X-Cache', 'HIT');
            return res.json(cacheMatch);
        }
        
        // 2. Fetch from Nominatim with a 5-second timeout fallback
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        let response;
        try {
            response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`, {
                headers: {
                    'User-Agent': 'JourneyAI-Production/1.0 (contact@journeyai.com)'
                },
                signal: controller.signal
            });
        } catch (fetchErr) {
            clearTimeout(timeout);
            throw fetchErr; // delegate to outer catch for cache fallback
        }
        clearTimeout(timeout);
        
        if (!response.ok) {
            console.warn(`[Geocode Proxy] Nominatim returned non-OK status ${response.status} — looking for substring cache matches`);
            for (const key of Object.keys(GEOCODE_CACHE)) {
                if (normQ.includes(key)) {
                    console.log(`[Geocode Cache Substring Hit] "${q}" matched "${key}"`);
                    res.setHeader('X-Cache', 'HIT');
                    return res.json(GEOCODE_CACHE[key]);
                }
            }
            console.warn(`[Geocode Proxy Fallback] No cache match for "${q}" — returning default Delhi coordinate.`);
            res.setHeader('X-Cache', 'FALLBACK');
            return res.json([{
                "lat": "28.6139",
                "lon": "77.2090",
                "display_name": `${q} (Default Location)`
            }]);
        }
        
        const data = await response.json();
        
        // Save to cache for subsequent requests
        if (data && data.length > 0) {
            GEOCODE_CACHE[normQ] = data;
            res.setHeader('X-Cache', 'MISS');
            return res.json(data);
        }
        
        // If data is empty, try substring match before defaulting
        for (const key of Object.keys(GEOCODE_CACHE)) {
            if (normQ.includes(key)) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(GEOCODE_CACHE[key]);
            }
        }

        console.warn(`[Geocode Proxy Fallback] Empty results from Nominatim for "${q}" — returning default Delhi coordinate.`);
        res.setHeader('X-Cache', 'FALLBACK');
        return res.json([{
            "lat": "28.6139",
            "lon": "77.2090",
            "display_name": `${q} (Default Location)`
        }]);
    } catch (err) {
        console.error("Geocode Proxy Error:", err);
        // Fall back to substring cache on network errors as well
        const normQ = (req.query.q || '').trim().toLowerCase();
        for (const key of Object.keys(GEOCODE_CACHE)) {
            if (normQ.includes(key)) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(GEOCODE_CACHE[key]);
            }
        }
        console.warn(`[Geocode Proxy Fallback] Exception caught — returning default Delhi coordinate.`);
        res.setHeader('X-Cache', 'FALLBACK');
        return res.json([{
            "lat": "28.6139",
            "lon": "77.2090",
            "display_name": `${req.query.q || 'India'} (Default Location)`
        }]);
    }
});

// ─── Weather API Proxy (Open-Meteo — Free, no key required) ─────────────────
const weatherCache = new Map(); // lat,lon,days → { data, ts }
const WEATHER_CACHE_TTL = 15 * 60 * 1000; // 15 min

// WMO Weather code to icon/label mapping
function getWMOLabel(code) {
    if (code === 0) return { label: 'Sunny', icon: '☀️', advisory: null };
    if ([1, 2].includes(code)) return { label: 'Partly Cloudy', icon: '⛅', advisory: null };
    if (code === 3) return { label: 'Overcast', icon: '☁️', advisory: null };
    if ([45, 48].includes(code)) return { label: 'Foggy', icon: '🌫️', advisory: 'Low visibility — drive carefully.' };
    if ([51, 53, 55].includes(code)) return { label: 'Drizzle', icon: '🌦️', advisory: 'Light rain expected — carry an umbrella.' };
    if ([61, 63, 65].includes(code)) return { label: 'Rainy', icon: '🌧️', advisory: 'Heavy rain expected — waterproof gear recommended.' };
    if ([71, 73, 75, 77].includes(code)) return { label: 'Snowy', icon: '❄️', advisory: 'Snow/ice on roads — take care on mountain passes.' };
    if ([80, 81, 82].includes(code)) return { label: 'Showers', icon: '🌦️', advisory: 'Rain showers likely — plan indoor activities.' };
    if ([85, 86].includes(code)) return { label: 'Snow Showers', icon: '🌨️', advisory: 'Snow showers — dress warmly.' };
    if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', icon: '⛈️', advisory: '⚠️ Thunderstorm alert — avoid outdoor activities.' };
    return { label: 'Mild', icon: '🌤️', advisory: null };
}

// Helper to format UNIX timestamp with timezone offset to HH:MM format
function formatTime(unixTimestamp, timezoneOffsetSeconds) {
    try {
        const date = new Date((unixTimestamp + (timezoneOffsetSeconds || 0)) * 1000);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
}

// Map OWM Icon codes to Emojis
function mapOWMIcon(iconCode) {
    const mapping = {
        '01d': '☀️', '01n': '🌙',
        '02d': '⛅', '02n': '☁️',
        '03d': '☁️', '03n': '☁️',
        '04d': '☁️', '04n': '☁️',
        '09d': '🌧️', '09n': '🌧️',
        '10d': '🌦️', '10n': '🌧️',
        '11d': '⛈️', '11n': '⛈️',
        '13d': '❄️', '13n': '❄️',
        '50d': '🌫️', '50n': '🌫️'
    };
    return mapping[iconCode] || '🌤️';
}

app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon, days = 7, destination = '' } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ success: false, message: "lat and lon are required" });
        }
        const cacheKey = `${parseFloat(lat).toFixed(3)},${parseFloat(lon).toFixed(3)},${days}`;
        const cached = weatherCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL) {
            res.setHeader('X-Cache', 'HIT');
            return res.json(cached.data);
        }

        const owmKey = process.env.OPENWEATHERMAP_API_KEY;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

        if (owmKey) {
            try {
                // Fetch Current and 5-Day/3-Hour Forecast from OpenWeatherMap
                const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${owmKey}&units=metric`;
                const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${owmKey}&units=metric`;

                const [currRes, foreRes] = await Promise.all([
                    fetch(currentUrl, { signal: controller.signal }),
                    fetch(forecastUrl, { signal: controller.signal })
                ]);

                if (currRes.ok && foreRes.ok) {
                    const currData = await currRes.json();
                    const foreData = await foreRes.json();
                    clearTimeout(timeout);

                    // Process current weather fields
                    const current = {
                        temp: Math.round(currData.main.temp),
                        feels_like: Math.round(currData.main.feels_like),
                        humidity: currData.main.humidity,
                        windSpeed: Math.round(currData.wind.speed * 3.6), // convert m/s to km/h
                        visibility: Math.round((currData.visibility || 10000) / 1000), // convert m to km
                        sunrise: formatTime(currData.sys.sunrise, currData.timezone),
                        sunset: formatTime(currData.sys.sunset, currData.timezone),
                        label: currData.weather?.[0]?.main || 'Mild',
                        icon: mapOWMIcon(currData.weather?.[0]?.icon)
                    };

                    // Group forecast by day
                    const daysMap = {};
                    foreData.list.forEach(item => {
                        const dateStr = item.dt_txt.split(' ')[0]; // YYYY-MM-DD
                        if (!daysMap[dateStr]) daysMap[dateStr] = [];
                        daysMap[dateStr].push(item);
                    });

                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const forecast = [];
                    let dayIdx = 0;

                    for (const [dateStr, items] of Object.entries(daysMap)) {
                        if (forecast.length >= 7) break;

                        const temps = items.map(i => i.main.temp);
                        const tempMax = Math.round(Math.max(...temps));
                        const tempMin = Math.round(Math.min(...temps));

                        const winds = items.map(i => i.wind.speed * 3.6);
                        const maxWind = Math.round(Math.max(...winds));

                        let precipSum = 0;
                        items.forEach(i => {
                            if (i.rain && i.rain['3h']) precipSum += i.rain['3h'];
                            if (i.snow && i.snow['3h']) precipSum += i.snow['3h'];
                        });

                        const midItem = items.find(i => i.dt_txt.includes('12:00:00')) || items[0];
                        const label = midItem.weather?.[0]?.main || 'Mild';
                        const icon = mapOWMIcon(midItem.weather?.[0]?.icon);

                        const date = new Date(dateStr + 'T00:00:00');
                        const dayName = dayIdx === 0 ? 'Today' : dayIdx === 1 ? 'Tomorrow' : dayNames[date.getDay()];

                        let advisory = null;
                        if (precipSum > 5) advisory = 'Rain expected — carry an umbrella.';
                        if (tempMax > 38) advisory = '⚠️ Extreme summer heat — stay indoors in afternoon.';
                        if (tempMin < 5) advisory = '❄️ Freezing temperatures — dress in heavy layers.';

                        forecast.push({
                            date: dateStr,
                            dayName,
                            tempMax,
                            tempMin,
                            label,
                            icon,
                            precipitation: Math.round(precipSum),
                            precipProbability: Math.round(precipSum > 0 ? 60 : 10),
                            windSpeed: maxWind,
                            advisory
                        });
                        dayIdx++;
                    }

                    const topAdvisory = forecast.find(d => d.advisory)?.advisory || null;

                    const result = {
                        destination: destination || 'Your Destination',
                        current,
                        forecast,
                        advisory: topAdvisory,
                        source: 'openweathermap'
                    };

                    weatherCache.set(cacheKey, { data: result, ts: Date.now() });
                    res.setHeader('X-Cache', 'MISS');
                    return res.json(result);
                }
            } catch (owmErr) {
                console.warn('[OpenWeatherMap API] Failed, falling back to Open-Meteo:', owmErr.message);
            }
        }

        // --- Free Open-Meteo Fallback Route (fully enriched) ---
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,precipitation_probability_max,sunrise,sunset` +
            `&hourly=relativehumidity_2m,apparent_temperature,visibility&current_weather=true&timezone=auto&forecast_days=${Math.min(parseInt(days) || 7, 7)}`;

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
        const raw = await response.json();

        // Process current weather
        const current = raw.current_weather || {};
        const curWMO = getWMOLabel(current.weathercode || 0);

        // Process daily forecasts
        const daily = raw.daily || {};
        const forecastDays = (daily.time || []).length;
        const forecast = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 0; i < forecastDays; i++) {
            const date = new Date(daily.time[i] + 'T00:00:00');
            const wmo = getWMOLabel(daily.weathercode[i] || 0);
            
            // Format sunrise/sunset to HH:MM format
            const sunriseStr = daily.sunrise?.[i] ? daily.sunrise[i].split('T')[1] : '';
            const sunsetStr = daily.sunset?.[i] ? daily.sunset[i].split('T')[1] : '';

            forecast.push({
                date: daily.time[i],
                dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayNames[date.getDay()],
                tempMax: Math.round(daily.temperature_2m_max[i] || 0),
                tempMin: Math.round(daily.temperature_2m_min[i] || 0),
                weatherCode: daily.weathercode[i] || 0,
                label: wmo.label,
                icon: wmo.icon,
                precipitation: Math.round(daily.precipitation_sum[i] || 0),
                precipProbability: Math.round(daily.precipitation_probability_max[i] || 0),
                windSpeed: Math.round(daily.windspeed_10m_max[i] || 0),
                sunrise: sunriseStr,
                sunset: sunsetStr,
                advisory: wmo.advisory
            });
        }

        // Average humidity from hourly (first 24h)
        const hourly = raw.hourly || {};
        const humiditySlice = (hourly.relativehumidity_2m || []).slice(0, 24);
        const avgHumidity = humiditySlice.length > 0
            ? Math.round(humiditySlice.reduce((a, b) => a + b, 0) / humiditySlice.length)
            : 65;

        const feelsLikeSlice = (hourly.apparent_temperature || []).slice(0, 24);
        const avgFeelsLike = feelsLikeSlice.length > 0
            ? Math.round(feelsLikeSlice.reduce((a, b) => a + b, 0) / feelsLikeSlice.length)
            : Math.round(current.temperature || 0);

        const visSlice = (hourly.visibility || []).slice(0, 24);
        const avgVis = visSlice.length > 0
            ? Math.round((visSlice.reduce((a, b) => a + b, 0) / visSlice.length) / 1000) // to km
            : 10;

        const topAdvisory = forecast.find(d => d.advisory)?.advisory || null;

        const result = {
            destination: destination || 'Your Destination',
            current: {
                temp: Math.round(current.temperature || 0),
                feels_like: avgFeelsLike,
                humidity: avgHumidity,
                windSpeed: Math.round(current.windspeed || 0),
                visibility: avgVis,
                sunrise: forecast[0]?.sunrise || '06:00',
                sunset: forecast[0]?.sunset || '18:30',
                weatherCode: current.weathercode || 0,
                label: curWMO.label,
                icon: curWMO.icon
            },
            forecast,
            advisory: topAdvisory,
            source: 'open-meteo'
        };

        weatherCache.set(cacheKey, { data: result, ts: Date.now() });
        res.setHeader('X-Cache', 'MISS');
        return res.json(result);
    } catch (err) {
        console.error('[Weather Proxy Error]:', err.message);
        // Return graceful fallback structure
        return res.json({
            destination: req.query.destination || 'India',
            current: { temp: 28, feels_like: 30, humidity: 65, windSpeed: 12, visibility: 10, sunrise: "06:00", sunset: "18:30", weatherCode: 1, label: 'Partly Cloudy', icon: '⛅' },
            forecast: [
                { dayName: 'Today', tempMax: 32, tempMin: 24, label: 'Partly Cloudy', icon: '⛅', precipitation: 0, precipProbability: 10, windSpeed: 12, advisory: null },
                { dayName: 'Tomorrow', tempMax: 31, tempMin: 23, label: 'Sunny', icon: '☀️', precipitation: 0, precipProbability: 5, windSpeed: 10, advisory: null },
                { dayName: 'Day 3', tempMax: 29, tempMin: 22, label: 'Showers', icon: '🌦️', precipitation: 4, precipProbability: 45, windSpeed: 18, advisory: 'Light rain expected — carry an umbrella.' }
            ],
            advisory: null,
            _fallback: true
        });
    }
});


// ─── OpenRouteService Route Proxy (with OSRM fallback) ──────────────────────
const ORS_API_KEY = process.env.ORS_API_KEY || '';
const routeCache = new Map();
const ROUTE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

app.get('/api/ors-route', async (req, res) => {
    try {
        const { start, end, mode = 'driving' } = req.query;
        if (!start || !end) return res.status(400).json({ success: false, message: 'start and end required as lat,lon' });

        const cacheKey = `${start}_${end}_${mode}`;
        const cached = routeCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < ROUTE_CACHE_TTL) {
            res.setHeader('X-Cache', 'HIT');
            return res.json(cached.data);
        }

        const [sLat, sLon] = start.split(',').map(Number);
        const [eLat, eLon] = end.split(',').map(Number);

        if ([sLat, sLon, eLat, eLon].some(isNaN)) {
            return res.status(400).json({ success: false, message: 'Invalid coordinates' });
        }

        let routeData = null;

        // Try OpenRouteService first (if key available)
        if (ORS_API_KEY) {
            try {
                const orsProfile = mode === 'walking' ? 'foot-walking' : mode === 'cycling' ? 'cycling-regular' : 'driving-car';
                const orsUrl = `https://api.openrouteservice.org/v2/directions/${orsProfile}?api_key=${ORS_API_KEY}&start=${sLon},${sLat}&end=${eLon},${eLat}`;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                const orsRes = await fetch(orsUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (orsRes.ok) {
                    const orsData = await orsRes.json();
                    const feature = orsData.features?.[0];
                    if (feature) {
                        const seg = feature.properties?.segments?.[0];
                        const coords = feature.geometry?.coordinates || [];
                        routeData = {
                            source: 'ors',
                            distance_km: parseFloat(((seg?.distance || 0) / 1000).toFixed(2)),
                            duration_min: Math.round((seg?.duration || 0) / 60),
                            coords: coords.map(c => [c[1], c[0]]), // [lon,lat] → [lat,lon]
                            steps: (seg?.steps || []).map(s => ({ instruction: s.instruction, distance: s.distance }))
                        };
                    }
                }
            } catch (orsErr) {
                console.warn('[ORS] Failed, falling back to OSRM:', orsErr.message);
            }
        }

        // Fallback to OSRM (free, public)
        if (!routeData) {
            try {
                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${sLon},${sLat};${eLon},${eLat}?overview=full&geometries=geojson&steps=true`;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (osrmRes.ok) {
                    const osrmData = await osrmRes.json();
                    const leg = osrmData.routes?.[0]?.legs?.[0];
                    const coords = osrmData.routes?.[0]?.geometry?.coordinates || [];
                    routeData = {
                        source: 'osrm',
                        distance_km: parseFloat(((osrmData.routes?.[0]?.distance || 0) / 1000).toFixed(2)),
                        duration_min: Math.round((osrmData.routes?.[0]?.duration || 0) / 60),
                        coords: coords.map(c => [c[1], c[0]]),
                        steps: []
                    };
                }
            } catch (osrmErr) {
                console.warn('[OSRM] Also failed:', osrmErr.message);
            }
        }

        if (!routeData) {
            // Haversine straight-line fallback
            const R = 6371;
            const dLat = (eLat - sLat) * Math.PI / 180;
            const dLon = (eLon - sLon) * Math.PI / 180;
            const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(sLat*Math.PI/180)*Math.cos(eLat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
            const straightKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            routeData = {
                source: 'haversine',
                distance_km: parseFloat((straightKm * 1.3).toFixed(2)),
                duration_min: Math.round(straightKm * 1.3 * 2.5 + 3),
                coords: [[sLat, sLon], [eLat, eLon]],
                steps: []
            };
        }

        routeCache.set(cacheKey, { data: routeData, ts: Date.now() });
        res.setHeader('X-Cache', 'MISS');
        return res.json(routeData);
    } catch (err) {
        console.error('[ORS Route Proxy Error]:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});


// Country API Proxy (REST Countries API)
const countryCache = new Map();
const COUNTRY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

app.get('/api/countries', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return res.status(400).json({ success: false, message: 'Country name is required' });

        const normName = name.trim().toLowerCase();
        if (countryCache.has(normName)) {
            const cached = countryCache.get(normName);
            if (Date.now() - cached.ts < COUNTRY_CACHE_TTL) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(cached.data);
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        let response;
        try {
            let baseUrl = (process.env.REST_COUNTRIES_API_URL || 'https://restcountries.com/v3.1').trim().replace(/\/$/, '');
            if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                baseUrl = 'https://restcountries.com/v3.1';
            }
            response = await fetch(`${baseUrl}/name/${encodeURIComponent(name)}`, { signal: controller.signal });
        } catch (fetchErr) {
            console.warn('[REST Countries API] fetch failed:', fetchErr.message);
        }
        clearTimeout(timeout);

        if (response && response.ok) {
            const data = await response.json();
            const country = data[0];
            if (country) {
                const currencies = Object.values(country.currencies || {}).map(c => `${c.name} (${c.symbol || c.code || ''})`).join(', ');
                const languages = Object.values(country.languages || {}).join(', ');
                const timezone = (country.timezones || []).join(', ');
                const callingCode = country.idd?.root ? (country.idd.root + (country.idd.suffixes?.[0] || '')) : '';

                const result = {
                    name: country.name?.common || name,
                    capital: (country.capital || []).join(', '),
                    currency: currencies || 'INR (₹)',
                    timezone: timezone || 'UTC+05:30',
                    languages: languages || 'Hindi, English',
                    flag: country.flag || '🇮🇳',
                    flagUrl: country.flags?.svg || country.flags?.png || '',
                    callingCode: callingCode || '+91'
                };

                countryCache.set(normName, { data: result, ts: Date.now() });
                res.setHeader('X-Cache', 'MISS');
                return res.json(result);
            }
        }

        // Fallback for India and generic safe country metadata
        const fallback = {
            name: "India",
            capital: "New Delhi",
            currency: "Indian Rupee (₹)",
            timezone: "UTC+05:30",
            languages: "Hindi, English",
            flag: "🇮🇳",
            flagUrl: "https://flagcdn.com/in.svg",
            callingCode: "+91"
        };
        return res.json(fallback);
    } catch (err) {
        console.error('[Country Proxy Error]:', err.message);
        return res.json({
            name: "India",
            capital: "New Delhi",
            currency: "Indian Rupee (₹)",
            timezone: "UTC+05:30",
            languages: "Hindi, English",
            flag: "🇮🇳",
            flagUrl: "https://flagcdn.com/in.svg",
            callingCode: "+91"
        });
    }
});

// News API Proxy
const newsCache = new Map();
const NEWS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

app.get('/api/news', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ success: false, message: 'Query destination is required' });

        const normQ = q.trim().toLowerCase();
        if (newsCache.has(normQ)) {
            const cached = newsCache.get(normQ);
            if (Date.now() - cached.ts < NEWS_CACHE_TTL) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(cached.data);
            }
        }

        const apiKey = process.env.NEWS_API_KEY;
        let articles = [];

        if (apiKey) {
            try {
                const queryStr = `(${q}) AND (travel OR tourism OR festival OR advisory OR transport OR weather)`;
                const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(queryStr)}&apiKey=${apiKey}&language=en&sortBy=relevance&pageSize=4`;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 6000);
                const response = await fetch(newsUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (response.ok) {
                    const data = await response.json();
                    if (data.articles && data.articles.length > 0) {
                        articles = data.articles.map(art => ({
                            title: art.title,
                            description: art.description || 'No description available.',
                            url: art.url,
                            source: art.source?.name || 'News',
                            publishedAt: art.publishedAt
                        }));
                    }
                }
            } catch (err) {
                console.warn('[News API Error]:', err.message);
            }
        }

        // Pre-curated high-quality mock advisory & travel news fallback
        if (articles.length === 0) {
            const destLower = normQ.toLowerCase();
            if (destLower.includes('goa')) {
                articles = [
                    { title: "Goa Beach Safety Advisory", description: "Lifeguard association advises tourists to swim only in designated zones during high tide.", url: "https://www.goatourism.gov.in", source: "Goa Travel Desk", publishedAt: new Date().toISOString() },
                    { title: "Indo-Portuguese Cultural Festival", description: "Dates announced for the annual heritage exhibition in Fontainhas Latin Quarter.", url: "https://www.goatourism.gov.in", source: "Heritage Trust", publishedAt: new Date().toISOString() },
                    { title: "Dudhsagar Waterfall Trek Open", description: "Eco-tourism walks and jeep safaris have officially resumed with limited daily passes.", url: "https://www.goatourism.gov.in", source: "Forest Dept", publishedAt: new Date().toISOString() }
                ];
            } else if (destLower.includes('udaipur') || destLower.includes('jaipur') || destLower.includes('rajasthan')) {
                articles = [
                    { title: "Mewar Festival Cultural Calendar", description: "Udaipur Tourism board releases schedule for palace lake boat processions and folk dances.", url: "https://tourism.rajasthan.gov.in", source: "Rajasthan News", publishedAt: new Date().toISOString() },
                    { title: "Vande Bharat Connectivity Updates", description: "High-speed rail links from Delhi and Jaipur to Udaipur are now fully operational.", url: "https://tourism.rajasthan.gov.in", source: "Transit Advisory", publishedAt: new Date().toISOString() },
                    { title: "Sajjangarh Palace Monsoon Timings", description: "Hillside monsoon palace updates visitor hours to 9 AM - 6 PM for sunset viewpoints.", url: "https://tourism.rajasthan.gov.in", source: "Udaipur Forest", publishedAt: new Date().toISOString() }
                ];
            } else if (destLower.includes('leh') || destLower.includes('ladakh')) {
                articles = [
                    { title: "Ladakh High-Altitude Safety Advisory", description: "Strict 48-hour acclimatization stay in Leh mandatory for all air arrivals before trekking.", url: "https://lahdcleh.in", source: "Leh Health Dept", publishedAt: new Date().toISOString() },
                    { title: "Manali-Leh Highway Open", description: "Border Roads Organisation clears snow from passes; travel allowed with tourist permits.", url: "https://lahdcleh.in", source: "BRO India", publishedAt: new Date().toISOString() },
                    { title: "Pangong Tso Lakeside Rules", description: "Camping guidelines tightened near the lake boundary to preserve local wildlife habitats.", url: "https://lahdcleh.in", source: "Ladakh Wildlife", publishedAt: new Date().toISOString() }
                ];
            } else if (destLower.includes('munnar') || destLower.includes('kerala')) {
                articles = [
                    { title: "Eravikulam National Park Pass Booking", description: "Online booking mandatory for Rajamala trail to view Nilgiri Tahr mountain goats.", url: "https://www.keralatourism.org", source: "Kerala Forest", publishedAt: new Date().toISOString() },
                    { title: "Alleppey Houseboat Safety Guidelines", description: "Port authority introduces new navigation guidelines and fitness certificates for cruise boats.", url: "https://www.keralatourism.org", source: "Alleppey News", publishedAt: new Date().toISOString() },
                    { title: "Eco-Trail Tourism Project Launches", description: "New walking tracks and tea estate museum trails open for tourists in Munnar hills.", url: "https://www.keralatourism.org", source: "Munnar Board", publishedAt: new Date().toISOString() }
                ];
            } else {
                articles = [
                    { title: `Travel Advisory: Exploring ${q}`, description: "Local tourism board announces updated guidelines for heritage monuments and local markets.", url: "https://www.incredibleindia.org", source: "Incredible India", publishedAt: new Date().toISOString() },
                    { title: "Seasonal Weather & Packing Tips", description: "Mild seasonal changes expected. Check local forecast details before going on outdoor treks.", url: "https://www.incredibleindia.org", source: "Travel Weather", publishedAt: new Date().toISOString() }
                ];
            }
        }

        const result = { success: true, destination: q, articles };
        newsCache.set(normQ, { data: result, ts: Date.now() });
        res.setHeader('X-Cache', 'MISS');
        return res.json(result);
    } catch (err) {
        console.error('[News Proxy Error]:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve travel news.' });
    }
});




// Routes
// 4. Import Auth Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/trips/image/unsplash', rateLimitMiddleware);
app.use('/api/trips', tripRoutes);
app.use('/api/users', userRoutes);

const PORT = process.env.PORT || 5001;
let server;
if (process.env.NODE_ENV !== 'test') {
    server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

// Graceful Shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n[${signal}] Received. Starting graceful shutdown...`);
    if (server) {
        server.close(() => {
            console.log('HTTP server closed.');
        });
    }
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
    }
    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = app;