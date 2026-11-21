# Стримы

`<source>` маршрутизирует запрос конкретному адаптеру. Каждый читатель использует свою группу; `appercot` использует `spotter-appercot`.

| Стрим | Пишет | Читает | Назначение |
| --- | --- | --- | --- |
| `spotter.event` | frigate | server | Событие start/update/end |
| `spotter.probe.request.<source>` | telegram, appercot | frigate | Породить тестовое событие в NVR |
| `spotter.probe.result` | frigate | telegram, appercot | Принятие или отказ probe |
| `spotter.catalog.updated` | frigate | server, telegram, pwa, appercot | Каталог камер и объектов |
| `spotter.catalog.request` | потребители | frigate | Переопубликовать каталог |
| `spotter.media.request.<source>` | server | frigate | Стейджинг медиа события |
| `spotter.media.staged` | frigate | depot | Снимок в S3, быстрая полоса |
| `spotter.media.staged.clip` | frigate | depot | Клип в S3, медленная полоса |
| `spotter.event.media_processed` | depot | server | Обработанные ключи |
| `spotter.media.progress` | frigate, depot | telegram, appercot | Стадия готовности клипа |
| `spotter.camera.request.<source>` | telegram, pwa, appercot | frigate | Запрос кадра |
| `spotter.camera.staged` | frigate | depot | Сырой кадр в S3 |
| `spotter.camera.frame_processed` | depot | telegram, appercot | Обработанный кадр |
| `spotter.notifications.suspend.<source>` | telegram, appercot | frigate | Приглушить уведомления NVR |
| `spotter.timelapse.request.<source>` | telegram, pwa, appercot | frigate | Запрос экспорта |
| `spotter.timelapse.progress` | frigate | telegram, appercot | Экспорт продолжается |
| `spotter.timelapse.ready` | frigate | telegram, pwa, appercot | Готовый таймлапс в S3 |
| `spotter.timelapse.failed` | frigate | telegram, pwa, appercot | Экспорт не состоялся |
| `spotter.delivery.event` | server | telegram, pwa, email, appercot | Событие create/update/media |
| `spotter.delivery.recipient` | server | telegram, pwa, appercot | Роль или отзыв доступа |
| `spotter.command.request` | telegram, pwa, appercot | server | Доменная команда RPC |
| `spotter.command.reply` | server | telegram, pwa, appercot | Ответ с `requestId` |
| `spotter.heartbeat` | все сервисы | telegram, pwa, appercot | Живость, версии и очереди |
| `frigate/events` (MQTT) | Frigate | frigate | Сырые события NVR |
| `frigate/reviews` (MQTT) | Frigate | frigate | Вердикт alert/detection |

`requestId` связывает кадр, probe и таймлапс с исходным запросом фронтенда. Telegram дополнительно использует числовые `chatId`/`messageId`; PWA обрабатывает только таймлапсы без чужого `requestId`.
