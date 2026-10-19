@echo off
rem VideoNote Taker: start the local server (logic lives in start-backend.ps1)
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-backend.ps1"
