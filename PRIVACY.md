# Политика конфиденциальности VideoNote Taker

_Действует с 20 октября 2026 г._

VideoNote Taker — расширение Chrome, которое создаёт конспекты видео YouTube с таймкодами. У расширения нет своего сервера: мы не получаем и не храним ваши данные.

## Какие данные обрабатываются

| Данные | Где хранятся | Кому передаются |
|---|---|---|
| Ваши конспекты, транскрипты и скриншоты | Только в вашем браузере (`chrome.storage.local`) | Никому |
| Ключи API (Groq, OpenAI) и настройки | Только в вашем браузере | Ключ используется только для запросов к соответствующему сервису (см. ниже) |
| Текст субтитров видео | Получается в вашем браузере со страницы видео | Отправляется в Groq или OpenAI **по вашему ключу** — чтобы составить конспект |
| Звук вкладки (только если вы включили «Запись в реальном времени») | Не сохраняется | Отправляется в OpenAI Whisper по вашему ключу для распознавания речи |

## Что мы НЕ делаем
- Не собираем историю просмотров, не отслеживаем вас и не показываем рекламу.
- Не продаём и не передаём данные третьим лицам, кроме указанных выше сервисов, которые вы сами выбрали.
- Не используем данные для оценки кредитоспособности и других целей, не связанных с работой расширения.

## Сторонние сервисы
- **Groq** — составление конспектов: https://groq.com (раздел Privacy Policy)
- **OpenAI** (по желанию) — Whisper и GPT-4o: https://openai.com/policies

Эти сервисы обрабатывают данные по своим правилам и по договору с вами (ключ API — ваш).

## Удаление данных
Все данные хранятся в вашем браузере: удалите конспекты во вкладке «История» или удалите расширение — данные исчезнут.

## Контакты
Вопросы: создайте issue на https://github.com/Tickling/videonote-taker/issues

---

# VideoNote Taker Privacy Policy (English)

VideoNote Taker creates timestamped notes for YouTube videos. The extension has no server of its own. Notes, transcripts, screenshots, settings and API keys are stored **only locally** in your browser. YouTube captions are read in your browser and sent to Groq or OpenAI **using your own API key** to generate the summary. Tab audio is processed only if you enable real-time transcription (sent to OpenAI Whisper with your key). We do not sell data, track browsing, show ads or use data for unrelated purposes. Uninstalling the extension deletes all data.
