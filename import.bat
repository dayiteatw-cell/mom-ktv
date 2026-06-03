@echo off
cd /d "%~dp0"
echo ====================================
echo Running Songs Import Helper...
echo This will fetch titles from YouTube...
echo ====================================
node parse_songs.js
pause
