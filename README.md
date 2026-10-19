# VideoNote Taker

Расширение Chrome + локальный сервер: транскрибация видео (YouTube, Rutube, VK Видео) и структурированные конспекты с таймкодами, скриншотами и экспортом в Word.

**Бесплатно по умолчанию** — автосубтитры через `yt-dlp` + Groq (`openai/gpt-oss-120b`; модель выбирается автоматически из доступных).
**Мощно по желанию** — OpenAI Whisper и GPT-4o по собственному ключу или локальный whisper.cpp.

## Для пользователя: установка

Готовый архив собирается командой `npm run release` → `release/VideoNote-Taker.zip`.
Внутри — `README.txt` с пошаговой инструкцией:

1. Установить [Node.js LTS](https://nodejs.org).
2. Запустить `start-backend.bat` (Windows) или `start-backend.command` (macOS/Linux). Скрипт сам поставит `yt-dlp` и `ffmpeg`.
3. `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное» → папка `extension`.
4. В открывшихся настройках вставить бесплатный ключ Groq (инструкция — кнопка «📖 Как получить ключ Groq?»).

## Возможности

| Сценарий | Как работает |
|---|---|
| Конспект по ссылке | popup → ссылка → backend скачивает субтитры (`yt-dlp --write-auto-sub --skip-download`) → Groq/GPT-4o пишет конспект |
| YouTube через VPN браузера | субтитры YouTube берутся прямо в браузере (панель «Расшифровка» → дорожка субтитров → перехват у плеера), поэтому работают VPN-расширения вроде Browsec; сервер — запасной путь |
| Конспект на странице видео | оранжевая кнопка справа внизу → sidebar с вкладками «Конспект / Транскрипт / Скриншоты», клик по таймкоду перематывает видео |
| Нет субтитров | Whisper (OpenAI, ключ в настройках) или локальный whisper.cpp; файлы > 24 МБ режутся на части |
| Real-time | `chrome.tabCapture` → offscreen-документ режет звук на фрагменты по 15 с → Whisper; если tabCapture недоступен — захват звука из `<video>` |
| Скриншоты | `Ctrl+Shift+S` или 📷 — кадр с таймкодом, привязка к фразе транскрипта, комментарий |
| Экспорт | Word (`docx`: конспект, ссылки на таймкоды, скриншоты, транскрипт) и Markdown |
| История | все конспекты в `chrome.storage.local`, поиск и фильтры по платформе и типу |
| 4 типа видео | 🎓 обучающий · 🎙️ интервью · 🎬 развлечение · 🎞️ фильм — свой промпт для каждого |

## Архитектура

Гексагональная (порты и адаптеры). Domain не зависит от инфраструктуры; зависимости собираются в composition root (`extension/src/infrastructure/container.ts`, `backend/src/app.ts`).

```
shared/src/            общий код: промпты по типам видео, map-reduce саммаризация, разбор ответа LLM, URL видео
extension/src/
  domain/              Timestamp, VideoUrl, Language, UserSettings, сущности, порты, ошибки
  application/         TranscriptionChain, SummaryServiceFactory, use cases
  infrastructure/      ChromeStorage, BackendAPI, Whisper/Groq/OpenAI, Canvas-скриншоты, Word/Markdown
  ui/                  popup, sidebar, settings (React + Tailwind)
  content/ background/ offscreen/
backend/src/
  domain/ application/ ProcessVideoJobUseCase, TranscribeChunkUseCase
  infrastructure/      YtDlpAdapter, SubtitlesExtractor (VTT/SRT), Whisper, LocalWhisper, LlmSummarizer, очередь, SQLite
  routes/              POST /api/transcribe-by-url, GET /api/jobs/:id, POST /api/transcribe-chunk, GET /api/health
```

**Ключи API** хранятся только в `chrome.storage.local`. Groq/GPT-4o и real-time Whisper вызываются из расширения напрямую. На backend ключ уходит (в заголовке `X-OpenAI-Api-Key`) только когда backend сам скачивает аудио для Whisper; в логах заголовки маскируются.

## Разработка

```bash
npm install
npm run build          # extension/dist + backend/dist
npm test               # Vitest: domain, application, адаптеры, HTTP API
npm run typecheck
npm run e2e            # Chromium с расширением + backend + поддельные yt-dlp и Groq
npm run guides         # пересобрать PDF-инструкции (нужен Chrome/Chromium)
npm run release        # release/VideoNote-Taker.zip
```

Запуск в режиме разработки: `npm run dev:backend` и `npm run dev:extension` (затем загрузить `extension/dist` в Chrome).

Требования: Node.js 20+, `yt-dlp` и `ffmpeg` в `PATH` (для YouTube yt-dlp использует Node как JS-движок).
