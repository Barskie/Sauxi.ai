@echo off
cd /d "%~dp0"
echo Starting Sauxi.ai. Open http://127.0.0.1:4318 in your browser.
echo Keep this window open while generating images.
node server.mjs
pause
