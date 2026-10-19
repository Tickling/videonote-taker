#!/bin/bash
# macOS / Linux: двойной клик (macOS) или ./start-backend.command
cd "$(dirname "$0")/server" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Не найден Node.js. Установите LTS-версию с https://nodejs.org и запустите снова."
  (command -v open >/dev/null && open https://nodejs.org) || true
  read -r -p "Нажмите Enter для выхода"; exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "[i] Устанавливаю yt-dlp и ffmpeg через Homebrew..."
    brew install yt-dlp ffmpeg
  elif command -v apt-get >/dev/null 2>&1; then
    echo "[i] Устанавливаю ffmpeg и yt-dlp (потребуется пароль)..."
    sudo apt-get update && sudo apt-get install -y ffmpeg pipx && pipx install "yt-dlp[default]" && pipx ensurepath
  else
    echo "[!] Установите yt-dlp и ffmpeg: https://github.com/yt-dlp/yt-dlp#installation"
    read -r -p "Нажмите Enter для выхода"; exit 1
  fi
fi

[ -f .env ] || cp .env.example .env
if [ ! -d node_modules ]; then
  echo "[i] Первый запуск: устанавливаю компоненты сервера (1-2 минуты)..."
  npm install --omit=dev --no-audit --no-fund || { read -r -p "Ошибка установки. Enter для выхода"; exit 1; }
fi

echo
echo " VideoNote Taker: сервер запускается. Не закрывайте это окно, пока пользуетесь расширением."
echo
exec node --env-file=.env dist/server.js
