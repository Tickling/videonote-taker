# Публикация в Chrome Web Store — пошагово

## Что нужно заранее
1. **Публичный репозиторий** — https://github.com/Tickling/videonote-taker → Settings → Danger Zone → Change visibility → Public.
   Нужен для страницы политики конфиденциальности и установки сервера.
2. **Пакет расширения** (версия «только YouTube», сервер не нужен):
   `npm run store:package` → `release/VideoNote-Taker-ChromeWebStore-1.0.0.zip`
   (Rutube/VK появятся позже: понадобится сервер, см. `deploy/README.md`).

## Шаги в магазине
1. Откройте https://chrome.google.com/webstore/devconsole, войдите в Google-аккаунт.
2. Примите соглашение и оплатите **разовый взнос $5** (нужна карта, работающая за рубежом).
3. В **Account**: укажите e-mail для связи и подтвердите его; статус «Non-trader» (если не продаёте).
4. **New item** → загрузите `VideoNote-Taker-ChromeWebStore-1.0.0.zip`.
5. Вкладка **Store listing** — тексты из `store/listing.md`, картинки из `store/screenshots/` и `store/promo-440x280.png`.
6. Вкладка **Privacy practices** — ответы из `store/review-answers.md`.
7. Вкладка **Distribution** — Public, все страны (или выберите нужные).
8. **Submit for review**. Проверка: от нескольких дней до 2–3 недель. Письмо придёт на e-mail.

## Если отклонят
Пришлите текст письма — исправим и отправим снова. Частые причины: неиспользуемое
разрешение, нет ссылки на политику конфиденциальности, неясное назначение расширения.

## Обновления
Увеличьте `version` в `extension/src/manifest.json`, соберите пакет заново и загрузите
его в той же карточке (Package → Upload new package).
