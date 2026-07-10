const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const bcrypt = require('bcryptjs');

module.exports = function (passport) {
    // 1. Local Strategy
    passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
        try {
            const user = await User.findOne({ email: email.toLowerCase() });
            if (!user || !user.password) {
                return done(null, false, { message: 'Invalid Credentials' });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return done(null, false, { message: 'Invalid Credentials' });
            }
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }));

    // 2. Google Strategy
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: '/auth/google/callback'
        }, async (accessToken, refreshToken, profile, done) => {
            // Guard: profile.photos or profile.emails may be absent
            const emailVal = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            const photoVal = profile.photos && profile.photos[0] ? profile.photos[0].value : 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile.id;

            try {
                let user = await User.findOne({ googleId: profile.id });
                if (user) {
                    // Keep profile info in sync with Google account on each login
                    user.displayName = profile.displayName;
                    user.fullName = profile.displayName;
                    if (emailVal) user.email = emailVal;
                    user.image = photoVal;
                    await user.save();
                    done(null, user);
                } else {
                    user = await User.create({
                        googleId: profile.id,
                        displayName: profile.displayName,
                        fullName: profile.displayName,
                        email: emailVal,
                        image: photoVal
                    });
                    done(null, user);
                }
            } catch (err) {
                console.error(err);
                done(err);
            }
        }));
    } else {
        console.warn("⚠️ Google OAuth credentials not found in .env. Google Login will be disabled.");
    }

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
};
