@echo off
title 🎤 媽媽 KTV 點歌機後台 🎤
set CWD=%~dp0
cd /d "%CWD%"

echo =========================================
echo 🎤 正在檢查環境並啟動 媽媽 KTV 點歌機...
echo =========================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [錯誤] 找不到 Node.js！請先安裝 Node.js (https://nodejs.org)
    pause
    exit /b
)

if not exist node_modules (
    echo [提示] 偵測到尚未安裝相依套件，正在自動安裝中...
    call npm install
)

echo.
echo 🚀 正在啟動伺服器...
node server.js
echo.
echo [提示] 伺服器已結束運行。
pause
