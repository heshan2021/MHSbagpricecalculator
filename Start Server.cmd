@echo off
title MHS Bag Price Calculator - local server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on this PC.
  echo   Install it from https://nodejs.org  ^(or use the Python option - see README.md^).
  echo.
  pause
  exit /b 1
)
node "serve.js"
echo.
echo   Server stopped.
pause
