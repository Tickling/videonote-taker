# Сервер VideoNote Taker в интернете

Сервер нужен для **Rutube и VK Видео** (и Whisper для видео без субтитров).
Видео YouTube расширение обрабатывает само, в браузере, — серверу они не нужны.

## 1. Арендуйте VPS
Подойдёт самый простой тариф:
- Ubuntu 24.04 (или 22.04 / Debian 12)
- 1 vCPU, 1–2 ГБ RAM, 15+ ГБ диска, публичный IPv4

Где взять (оплата российской картой): Timeweb Cloud, Aéza, Selectel, Beget — ориентировочно 300–600 ₽/мес.
**Локация:** Нидерланды/Германия, если планируете Whisper (OpenAI не принимает запросы с российских IP).
Если нужны только субтитры Rutube/VK — подойдёт и Россия.

## 2. Установите одной командой
Подключитесь к серверу (данные для входа пришлёт хостер; на Windows — программа PuTTY или «Терминал»):
```
ssh root@IP_СЕРВЕРА
```
и выполните:
```
curl -fsSL https://raw.githubusercontent.com/Tickling/videonote-taker/main/deploy/install.sh | bash
```
Скрипт сам поставит Docker, соберёт сервер, получит HTTPS-сертификат и в конце напишет адрес вида
`https://1-2-3-4.sslip.io` — это бесплатный домен на основе IP, покупать домен не нужно.
Свой домен: `curl … | DOMAIN=notes.example.com bash` (A-запись домена должна указывать на IP сервера).

> Репозиторий на GitHub должен быть публичным — иначе сервер не сможет его скачать.

## 3. Укажите адрес в расширении
⚙️ Настройки → Общие → «Адрес сервера VideoNote» → вставьте адрес → «Проверить» → «Сохранить».
Для версии из Chrome Web Store адрес вшивается при сборке: `VITE_BACKEND_URL=https://… npm run store:package`.

## Обслуживание
```
cd /opt/videonote-taker/deploy
docker compose logs --tail=100 backend     # журнал
git -C .. pull && docker compose up -d --build   # обновить до новой версии
docker compose restart backend             # перезапустить
```
Обновлять yt-dlp (сайты меняются): `docker compose build --no-cache backend && docker compose up -d`.

## Настройки (deploy/.env)
| Параметр | По умолчанию | Что делает |
|---|---|---|
| `ALLOWED_PLATFORMS` | `rutube,vk_video` | Какие сайты обрабатывает сервер |
| `JOBS_PER_HOUR_PER_IP` | `30` | Сколько видео в час с одного адреса (защита от злоупотреблений) |
| `RATE_LIMIT_PER_MINUTE` | `120` | Запросов в минуту с одного адреса |
| `MAX_CONCURRENT_JOBS` | `2` | Сколько видео обрабатывается одновременно |
| `GROQ_API_KEY` | — | Необязательно: ваш ключ Groq для пользователей без своего ключа |
