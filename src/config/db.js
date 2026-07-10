const mongoose = require('mongoose');

const connectDB = async () => {
    const primaryUri = process.env.MONGO_URI;
    const fallbackUri = 'mongodb://127.0.0.1:27017/journey_ai';

    try {
        console.log("Connecting to primary database (Atlas)...");
        const conn = await mongoose.connect(primaryUri, {
            serverSelectionTimeoutMS: 5000 // 5 seconds timeout
        });
        console.log(`MongoDB Connected (Atlas): ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Primary MongoDB Connection Failed: ${error.message}`);
        console.log("🔄 Attempting fallback to local MongoDB instance...");
        try {
            const conn = await mongoose.connect(fallbackUri, {
                serverSelectionTimeoutMS: 4000
            });
            console.log(`✅ Fallback MongoDB Connected (Local): ${conn.connection.host}`);
        } catch (fallbackError) {
            console.error(`❌ Fallback MongoDB Connection Failed: ${fallbackError.message}`);
        }
    }
};

module.exports = connectDB;
