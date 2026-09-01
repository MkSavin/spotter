# AGENTS.md — `@spotter/telegram`

Telegram-фронтенд доставки и взаимодействия. Консьюмит абстрактные delivery-команды от server, рендерит HTML и шлёт/редактирует сообщения grammY; держит Telegram-локальный стейт (чаты, биндинги uuid↔chat, message-id событий) и пресайнит обработанные S3-ключи в короткие URL. Домен не трогает — мутации уходят в server по `spotter.command.request`. Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/telegram
bun start            # или bun start:watch
bun test
```
Окружение: единый `.env` узла (см. [.env.example](../../.env.example) для single, [.env.cloud.example](../../.env.cloud.example) для cloud). Сервис читает `REDIS_URL`, `S3_*`, `TZ`, `TELEGRAM_TOKEN`, `S3_PRESIGN_EXPIRY`; consumer-группа (`spotter-telegram`), `DATABASE_PATH`, `SOURCE_ID` — с дефолтами в коде. NVR-кредов нет — S3 только для presign-байтов. `requireConfig` валидирует на старте.

## Точка входа

[src/index.ts](src/index.ts) (`polling`): поднимает grammY `Bot` + `@grammyjs/runner`, сессии (multi: `user`/`global`), `hydrate`/`parse-mode`, `attachInnoxious` (fallback-доставка медиа), кэш биндингов в сессию. Параллельно — три Redis-подключения (`subscriber`, выделенный `commandSubscriber` для `CommandBus`, `producer`), `CatalogCache`, и `RedisRegulator` (группа `spotter-telegram`, [src/transport/telegramTransport.ts](src/transport/telegramTransport.ts)):

- `spotter.delivery.event` → `deliveryEventController`
- `spotter.delivery.recipient` → `deliveryRecipientController`
- `spotter.camera.frame_processed` → `cameraFrameController`
- `spotter.catalog.updated` → `catalogController` (общий, из `@spotter/transport` — как и `CatalogCache`)

## Поток доставки

```
spotter.delivery.event ──▶ deliveryEventController ──▶ deliveryEventAction
   action create|update  → renderEvent → actualizeSentMessages (send/edit + кнопка «Видео»)
   action media (snapshot)→ editMessageMedia(текст→фото) + кнопка «Видео» (если есть клип)
   action media (clip)    → editMessageMedia(→видео), кнопка убирается
```

- **Медиа крепится «на оригинальное сообщение» edit-in-place**, а не отдельным media group. `editMessageMedia` (Bot API ≥ 7.11) добавляет медиа к текстовому сообщению и меняет фото→видео — один `message_id` морфится текст → фото → видео. ([actualizeEventMedia.ts](src/transport/mixins/actualizeEventMedia.ts)).
- **Кнопка «Видео»** ([eventKeyboard.ts](src/transport/view/eventKeyboard.ts)): появляется на фото/тексте, когда событие завершилось и имеет клип (`shouldOfferClip`). Нажатие → [clipCallback.ts](src/callback/clipCallback.ts): ack, кнопка → «⏳ запрошено» (защита от повторов), RPC `event.clip`. Готовый клип прилетает `delivery.event (media)` и через **fan-out по `eventId`** проставляется видео всем подписчикам этого события. Жать может любой в авторизованном чате (роль не проверяется).
- **Стадии ожидания клипа** ([ClipTracker](src/clip/ClipTracker.ts)): `spotter.media.progress` двигает кнопку «запрошено → скачивается → конвертируется». Стадии приходят только для клипов, которые бот реально ждёт — обычные события медиа-конвейера кнопку не рисуют. Каждая стадия перезапускает таймаут (`CLIP_TIMEOUT_MS`, 5 мин); истёк или пришёл `failed` — кнопка становится «повторить» с причиной, чтобы зависший запрос можно было перезапустить.
- [deliveryEventAction.ts](src/transport/actions/deliveryEventAction.ts): сопоставляет подписанные чаты с уже отправленными `event_messages` через [supplySubscribers.ts](src/transport/helpers/supplySubscribers.ts) (create/update/remove), message-id хранит **локально** (server присылает только intent + recipients).
- `media`-экшен пресайнит S3-ключи (`s3.presign`, `S3_PRESIGN_EXPIRY`) — server байты не отдаёт. `InnoxiousMedia` доставляет с fallback (naive URL → accurate buffer). Видео **заменяет** фото (Telegram не держит фото+видео в одном сообщении).
- [deliveryRecipientController.ts](src/transport/controllers/deliveryRecipientController.ts) держит кэш `tg_bindings.role` в синхроне: `update` меняет роль, `revoke` сносит биндинги и осиротевшие чаты.

## Команды и RPC

Команды (`src/commands/`) на фреймворке `SpotterCommand` + `registry`. Домен-мутирующие (login-redeem, promote/demote/revoke/sign, event clear/info, deployment version) **не пишут в БД напрямую** — шлют `context.commandBus.send(kind, args, principalUuid)`. `CommandBus` (в `@spotter/transport`, общий с pwa) публикует `spotter.command.request` и ждёт коррелированный ответ на `spotter.command.reply` (один фоновый poll-loop, 30 s timeout, `instanceId` разделяет инстансы на общем reply-стриме).

Snapshot-команда камеры идёт по медиа-контракту: `spotter.camera.request.<source>` → `camera.staged` → depot → `spotter.camera.frame_processed` → `cameraFrameController`.

`/timelapse` ([timelapseCommand.ts](src/commands/nvr/timelapseCommand.ts)) собирает таймлапс за период: камера и скорость кнопками, период текстом (`сегодня`, `15.08`, `15.08 09:00-18:00`). Скоростей ровно две — API Frigate принимает только `realtime` и `timelapse_25x`, а множитель второй задаётся в конфиге NVR (`record.export.timelapse_args`), поэтому лейбл говорит «ускоренно», не обещая кратность. Период парсится в **таймзоне бота** ([dateSpan.ts](src/timelapse/dateSpan.ts)) — иначе экспорт уехал бы на величину смещения — и уходит в шину уже как unix-секунды. Ответ приходит на `spotter.timelapse.ready` / `.failed`; экспорт долгий, поэтому команда только ставит его в очередь и показывает плейсхолдер.

**Тишина — две разные вещи, поэтому и команды разные.** `/mute [срок]` и `/unmute` ([notify/](src/commands/notify/)) глушат **только свой чат**: пишут `tg_chats.muted_until`, а `supplySubscribers` пропускает такие чаты при рассылке. Приглушение переживает рестарт (иначе оно бы слетало посреди отпуска), а истёкшее не требует уборки — сравнение идёт с часами. `/nvr_suspend <камера> <срок>` (ADMIN) — это уже глобально: уходит в `spotter.notifications.suspend.<source>`, адаптер публикует минуты в `frigate/<camera>/notifications/suspend`, и молчат **все** каналы и получатели. Смешивать их в одну команду нельзя: «не беспокоить меня» и «отключить оповещения всем» — разные намерения.

**Троттлинг.** `SpotterCommand` пропускает команды через `CommandThrottle` ([framework/throttle.ts](src/commands/framework/throttle.ts)) — 3 с на повтор в том же чате, 60 с для `/timelapse` (экспорт занимает NVR минутами). Гейт стоит **перед** проверкой доступа: спам командой, которую нельзя запускать, не должен стоить дешевле разрешённой. Команды, читающие только локальный стейт (`/me`, `/start`, `/logout`, `/camera_list`), помечены `throttled = false`. Состояние в памяти намеренно: кулдаун, переживший рестарт, наказал бы не тот запрос.

## БД (`src/db/`, drizzle/sqlite)

Telegram-локальный стейт — **никакого домена/ролей как источника истины**:

- `tg_chats (id PK)` — авторизованные чаты (получают уведомления через supplySubscribers).
- `tg_bindings ((tg_user_id, tg_chat_id) PK, recipient_uuid, username?, role)` — маппинг uuid↔chat + кэш роли для сессии (роль — копия, истина в server).
- `event_messages ((event_id, tg_chat_id) PK, message_id)` — какой message-id отправлен в какой чат (для edits и медиа-ответов).
  Пишется **только через `record` (upsert-слияние)**, никогда не перезаписывается целиком: при
  частичном или полном провале доставки список успешных чатов обязан пережить ретрай, иначе
  повторная доставка не увидит уже отправленное сообщение и пришлёт дубль. Удаление — точечное,
  через `forget(eventId, chatIds)`.
- `service_versions ((node, service) PK, version, seen_at)` — последняя виденная версия каждого сервиса; нужна, чтобы выкат детектился и после рестарта самого бота.

После правок `schema.ts` — `bunx drizzle-kit generate` (миграции в `apps/telegram/drizzle/`).

## Состояние инфраструктуры (`src/status/`)

Сервисы шлют heartbeat в `spotter.heartbeat` раз в 30 секунд; `heartbeatController` раздаёт их двум потребителям:

- `HeartbeatRegistry` (в `@spotter/transport`) — последний удар на `node/service` в памяти, читается `/status`. Сервис не исчезает при молчании, а помечается протухшим (`HEARTBEAT_STALE_MS`).
- `RolloutWatcher` — сравнивает версию с сохранённой в `service_versions` и через `ROLLOUT_DEBOUNCE_MS` (90 с тишины) шлёт админам одно беззвучное сообщение на всю волну. Первый в жизни удар сервиса молчит — иначе установка отчиталась бы как выкат.

## Особенности

- Адресация: server присылает `recipients: uuid[]` / intent — telegram сам резолвит uuid в chatId по `tg_bindings`.
- `applicationLogger = defaultLogger.sub('telegram')`. Тесты глушат логи (`logger.disable()`).
- NVR-знания нет: рендер берёт лейблы из `CatalogCache` (`spotter.catalog.<source>`), display-код события приходит в самом `SpotterEvent`.
