# Архитектура

Spotter отделяет NVR-адаптер, домен, обработку медиа и фронтенды. Сервисы общаются через Redis Streams; MQTT используется только на входе адаптера.

## Поток события и медиа

```text
Frigate ─MQTT─▶ frigate ─spotter.event─▶ server ─delivery.event─▶ frontend
                   │                       │                         │
                   └─ raw → S3 → depot ────┘                         └─ presign/upload
```

1. `frigate` парсит MQTT-событие и публикует `spotter.event`; каталог камер и объектов приходит через `spotter.catalog.updated`. Из `frigate/reviews` адаптер добавляет вердикт NVR `severity: alert|detection`.
2. `server` сохраняет событие в SQLite и публикует `spotter.delivery.event` с `create|update`. На `end` запрашивает только снимок: `spotter.media.request.<source>` с `want: ['snapshot']`.
3. Адаптер получает медиа из NVR, кладёт сырьё в S3 и публикует ключи в `spotter.media.staged` или `spotter.media.staged.clip`. URL и JWT NVR существуют только в адаптере.
4. `depot` читает сырьё по ключу, обрабатывает через ffmpeg или `Bun.Image` и отвечает ключами в `spotter.event.media_processed`. Снимки и клипы идут разными полосами, чтобы видео не задерживало фото; `DEPOT_LANE` выбирает полосу реплики.
5. `server` публикует `delivery.event` с `action: media`. Фронтенд получает байты из S3 или пресайнит ключ и прикрепляет результат к исходному сообщению либо показывает ссылку.
6. Кнопка «Видео» вызывает RPC `event.clip`; `server` запрашивает `want: ['clip']`. Готовый клип приходит обычным media-потоком всем подписчикам события. `spotter.media.progress` показывает `fetching|staged|failed`; ошибка или таймаут разрешает повтор.
7. Таймлапс идёт через `spotter.timelapse.request.<source>`. Адаптер сразу подтверждает запрос, а экспорт ведёт вне записи Redis. Прогресс приходит в `spotter.timelapse.progress`, результат — в `.ready` или `.failed`.

Список потоков и владельцев — в [streams](transport/streams.md). Модель ACK, reclaim и DLQ — в [transport](transport.md).

## Домен и фронтенды

`server` владеет событиями, recipients, кодами доступа и оркестрацией. Telegram, PWA и Appercot хранят только локальные привязки, сообщения и кэши; email хранит дедуп-леджер. Доменные мутации идут через `spotter.command.request` и коррелированный `spotter.command.reply`; `CommandBus` находится в `@spotter/transport`.

`spotter.delivery.event` не адресует конкретные чаты: каждый фронтенд сам выбирает свои активные привязки. Изменение роли и отзыв доступа приходят через `spotter.delivery.recipient`.

## Источники и топологии

Специфика NVR изолирована в `apps/frigate` и `@spotter/sink`; остальные сервисы используют контракты `@spotter/transport`. Для офлайн-разработки есть синтетический адаптер `apps/test`.

В распределённом деплое `forwarder` зеркалит стримы между локальным и удалённым Redis по карте `apps/forwarder/src/streams.ts`. Отсутствие стрима в карте означает, что он не доедет.

Профили dev/single/ingest/cloud описаны в [docs/deployment.md](../docs/deployment.md). Проверка настоящего NVR — в [docs/testing.md](../docs/testing.md). Поведение внешних систем собрано в [docs/foundings](../docs/foundings/).
