@echo off
chcp 65001 >nul
title VideoNote Taker — сервер
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Не найден Node.js. Скачайте версию LTS с https://nodejs.org , установите и запустите этот файл снова.
  start https://nodejs.org
  pause
  exit /b 1
)

where yt-dlp >nul 2>nul
if errorlevel 1 (
  echo [i] Устанавливаю yt-dlp и ffmpeg через winget...
  winget install -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
  winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  echo [i] Готово. Закройте это окно и запустите start-backend.bat ещё раз.
  pause
  exit /b 0
)

if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules" (
  echo [i] Первый запуск: устанавливаю компоненты сервера ^(1-2 минуты^)...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 ( echo [!] Не удалось установить компоненты. & pause & exit /b 1 )
)

echo.
echo  VideoNote Taker: сервер запускается. Не закрывайте это окно, пока пользуетесь расширением.
echo.
node --env-file=.env dist/server.js
pause
