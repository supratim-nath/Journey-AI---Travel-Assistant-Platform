#!/bin/bash

# 1. Install dependencies for both
echo "Installing Node.js dependencies..."
npm install

echo "Installing Python dependencies..."
cd ai_backend
if [ -d ".venv" ]; then
    source .venv/bin/activate
else
    # For cloud platforms that don't need venv
    pip install -r requirements.txt
fi
cd ..

# 2. Start the AI Backend in the background
echo "Starting AI Engine..."
cd ai_backend
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
cd ..

# 3. Start the Node Server in the foreground
echo "Starting Web Server..."
npm run start
