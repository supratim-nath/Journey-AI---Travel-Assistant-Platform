const User = require('../models/User');
const bcrypt = require('bcryptjs');

// 1. REGISTER NEW USER (Sign Up Form)
exports.registerUser = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ success: false, message: "Email already registered" });

        // Hash the password for safety
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user with the name and email from your index.html form
        user = new User({
            fullName,
            email,
            password: hashedPassword,
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
        });

        await user.save();
        res.status(201).json({ success: true, message: "Registration successful!" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. LOGIN USER (Log In Form)
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: "Invalid Credentials" });

        // Check if user is registered via Google OAuth
        if (!user.password) {
            return res.status(400).json({ 
                success: false, 
                message: "This email is registered via Google OAuth. Please use Google Login." 
            });
        }

        // Compare entered password with hashed password in DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Invalid Credentials" });

        // Establish the Passport session
        req.login(user, (err) => {
            if (err) return res.status(500).json({ success: false, message: "Session login failed" });
            
            res.json({
                success: true,
                message: `Welcome back, ${user.fullName}`,
                user: { id: user._id, name: user.fullName, fullName: user.fullName, email: user.email, image: user.image }
            });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. UPDATED PREFERENCES (Uses real User ID instead of 'guest_user_1')
exports.updatePreferences = async (req, res) => {
    try {
        const { diet, currency, pace, language } = req.body;

        // Use the ID strictly from the logged-in session (req.user is provided by Passport)
        const userId = req.user._id;

        const updateFields = {};
        if (diet !== undefined) updateFields['preferences.diet'] = diet;
        if (currency !== undefined) updateFields['preferences.currency'] = currency;
        if (pace !== undefined) updateFields['preferences.pace'] = pace;
        if (language !== undefined) updateFields['preferences.language'] = language;
        updateFields.updatedAt = Date.now();

        const user = await User.findByIdAndUpdate(userId, {
            $set: updateFields
        }, { new: true }).select('-password -googleId');

        res.json({ success: true, message: "Preferences synced to your account!", data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. GET PROFILE
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('-password -googleId');
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. UPDATE PROFILE PICTURE
exports.updateProfilePicture = async (req, res) => {
    try {
        const { image } = req.body;
        const userId = req.user._id;

        // Harden: reject non-http(s) URLs, localhost, private ranges, and data: URIs
        const BLOCKED_HOSTS = /localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\./;
        if (
            !image ||
            typeof image !== 'string' ||
            !(/^https?:\/\//.test(image)) ||
            BLOCKED_HOSTS.test(image)
        ) {
            return res.status(400).json({ success: false, message: "Invalid image URL" });
        }

        const user = await User.findByIdAndUpdate(userId, {
            image,
            updatedAt: Date.now()
        }, { new: true }).select('-password -googleId');

        res.json({ success: true, message: "Profile picture updated successfully!", data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};