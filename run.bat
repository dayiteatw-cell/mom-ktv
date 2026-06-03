@echo off
cd /d "%~dp0"
echo ====================================
echo Checking environment...
echo ====================================
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)
echo ====================================
echo Starting Mom KTV Server...
echo ====================================
node server.js
echo ====================================
echo Server stopped.
pause
