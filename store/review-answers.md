# Ответы для вкладки «Privacy practices» (Конфиденциальность)

Магазин проверяет эти ответы — копируйте как есть (на английском: так проверка проходит быстрее).

## Single purpose (Единственное назначение)
Creates structured, timestamped notes (summaries) for online videos on YouTube, Rutube and VK Video from their captions, with screenshots and export to Word/Markdown.

## Permission justification (Обоснование разрешений)

| Разрешение | Текст |
|---|---|
| `storage` | Stores the user's notes, screenshots, settings and API keys locally in the browser. |
| `unlimitedStorage` | Notes contain video frame screenshots (images), which can exceed the default 10 MB local storage quota. |
| `activeTab` | Captures a screenshot of the current video tab when the user presses the screenshot shortcut or button, and starts tab audio capture only after the user invokes the extension. |
| `tabCapture` | Optional real-time transcription: records the audio of the current video tab (only after the user clicks "Real-time recording") and sends it to the speech recognition service chosen by the user. |
| `offscreen` | Required by Manifest V3 to hold the tab audio stream for real-time transcription (MediaRecorder cannot run in the service worker). |
| `downloads` | Saves exported notes as Word (.docx) or Markdown files with the correct file name. |
| `scripting` | After installation/update, injects the extension's own content script into already open YouTube tabs so the feature works without reloading the page. |
| Host `youtube.com` | Reads video captions (subtitles) of the video the user is watching to build the note. |
| Host `api.groq.com`, `api.openai.com` | Sends the caption text to the AI provider selected by the user, using the user's own API key, to generate the summary. |
| Content scripts (YouTube, Rutube, VK) | Shows the note button and side panel next to the video, seeks the video when a timestamp is clicked, captures video frames for screenshots. |

## Remote code
No, I am not using remote code. (Весь код находится в пакете расширения.)

## Data usage (Какие данные собираются)
Отметьте:
- ☑ **Website content** — text of video captions is sent to the user-selected AI provider (Groq/OpenAI) to generate notes.
- ☑ **Web history** — the URL of a Rutube/VK video is sent to the VideoNote server only when the user requests a note for it.

Остальное (личные данные, здоровье, финансы, аутентификация, переписка, местоположение, активность пользователя) — **не отмечать**.

Отметьте все три подтверждения:
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL
https://github.com/Tickling/videonote-taker/blob/main/PRIVACY.md
(репозиторий должен быть публичным)
