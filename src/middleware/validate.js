/**
 * Express Input Sanitizer & Validator
 * Prevents NoSQL Injection by stripping keys beginning with '$' or containing '.'.
 * Performs manual validation on critical input schemas.
 */

// Recursive NoSQL Injection sanitizer
const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
        for (const key in obj) {
            if (key.startsWith('$') || key.includes('.')) {
                delete obj[key];
            } else if (typeof obj[key] === 'object') {
                sanitizeObject(obj[key]);
            }
        }
    }
};

const sanitizeInput = (req, res, next) => {
    sanitizeObject(req.body);
    sanitizeObject(req.query);
    sanitizeObject(req.params);
    next();
};

const validateRegistration = (req, res, next) => {
    const { fullName, email, password } = req.body;
    
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
        return res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }
    next();
};

const validateTrip = (req, res, next) => {
    const { destination, days, budget } = req.body;
    
    if (!destination || typeof destination !== 'string' || destination.trim().length < 2) {
        return res.status(400).json({ success: false, message: 'Destination must be at least 2 characters.' });
    }
    const parsedDays = parseInt(days);
    if (isNaN(parsedDays) || parsedDays < 1 || parsedDays > 30) {
        return res.status(400).json({ success: false, message: 'Days must be a number between 1 and 30.' });
    }
    next();
};

module.exports = { sanitizeInput, validateRegistration, validateTrip };
