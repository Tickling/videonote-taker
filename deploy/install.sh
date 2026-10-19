#!/usr/bin/env bash
# Установка сервера VideoNote Taker на чистый VPS (Ubuntu 22.04/24.04 или Debian 12).
# Запуск на сервере:
#   curl -fsSL https://raw.githubusercontent.com/Tickling/videonote-taker/main/deploy/install.sh | sudo bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Tickling/videonote-taker.git}"
APP_DIR="${APP_DIR:-/opt/videonote-taker}"

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then echo "Запустите с sudo"; exit 1; fi

say "Устанавливаю Docker и git"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null 2>&1 || (apt-get update && apt-get install -y git)

say "Скачиваю VideoNote Taker"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/deploy"

if [ ! -f .env ]; then
  cp .env.example .env
  DOMAIN_ARG="${DOMAIN:-}"
  if [ -z "$DOMAIN_ARG" ]; then
    IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
    DOMAIN_ARG="$(echo "$IP" | tr '.' '-').sslip.io"
  fi
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN_ARG|" .env
fi
DOMAIN_VALUE="$(grep '^DOMAIN=' .env | cut -d= -f2)"

say "Собираю и запускаю (первый раз 3–5 минут)"
docker compose --env-file .env up -d --build

say "Проверяю"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN_VALUE/api/health" >/dev/null 2>&1; then
    echo
    echo "✅ Сервер работает: https://$DOMAIN_VALUE"
    echo "   Этот адрес вставьте в расширение: ⚙️ Настройки → Общие → Адрес сервера"
    exit 0
  fi
  sleep 5
done
echo "⚠️  Сервер запущен, но HTTPS ещё не готов. Проверьте, что порты 80 и 443 открыты,"
echo "   и посмотрите журнал: cd $APP_DIR/deploy && docker compose logs --tail=50"
