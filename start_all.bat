@echo off
setlocal
echo ======================================================
echo ✨ STARTING ALL JOURNEY AI SERVERS ✨
echo ======================================================

:: 1. Start the Node.js Main Server (Database + Frontend)
echo 🚀 Starting Node.js Server...
start "Node.js Server" cmd /k "cd /d %~dp0 && npm run dev"

start "AI FastAPI Server" cmd /k "npm run start-ai"

echo ======================================================
echo 🎉 All systems are launching in separate windows!
echo 🤖 AI Intelligence: http://localhost:8000
echo 💻 Web View:         http://localhost:5001
echo ======================================================
pause
