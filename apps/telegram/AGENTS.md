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
- `spotter.catalog.updated` → `catalogController`

## Поток доставки

```
spotter.delivery.event ──▶ deliveryEventController ──▶ deliveryEventAction
   action create|update  → renderEvent → actualizeSentMessages (send/edit + кнопка «Видео»)
   action media (snapshot)→ editMessageMedia(текст→фото) + кнопка «Видео» (если есть клип)
   action media (clip)    → editMessageMedia(→видео), кнопка убирается
```

- **Медиа крепится «на оригинальное сообщение» edit-in-place**, а не отдельным media group. `editMessageMedia` (Bot API ≥ 7.11) добавляет медиа к текстовому сообщению и меняет фото→видео — один `message_id` морфится текст → фото → видео. ([actualizeEventMedia.ts](src/transport/mixins/actualizeEventMedia.ts)).
- **Кнопка «Видео»** ([eventKeyboard.ts](src/transport/view/eventKeyboard.ts)): появляется на фото/тексте, когда событие завершилось и имеет клип (`shouldOfferClip`). Нажатие → [clipCallback.ts](src/callback/clipCallback.ts): ack, кнопка → «⏳ обрабатывается» (защита от повторов), RPC `event.clip`. Готовый клип прилетает `delivery.event (media)` и через **fan-out по `eventId`** проставляется видео всем подписчикам этого события. Жать может любой в авторизованном чате (роль не проверяется).
- [deliveryEventAction.ts](src/transport/actions/deliveryEventAction.ts): сопоставляет подписанные чаты с уже отправленными `event_messages` через [supplySubscribers.ts](src/transport/helpers/supplySubscribers.ts) (create/update/remove), message-id хранит **локально** (server присылает только intent + recipients).
- `media`-экшен пресайнит S3-ключи (`s3.presign`, `S3_PRESIGN_EXPIRY`) — server байты не отдаёт. `InnoxiousMedia` доставляет с fallback (naive URL → accurate buffer). Видео **заменяет** фото (Telegram не держит фото+видео в одном сообщении).
- [deliveryRecipientController.ts](src/transport/controllers/deliveryRecipientController.ts) держит кэш `tg_bindings.role` в синхроне: `update` меняет роль, `revoke` сносит биндинги и осиротевшие чаты.

## Команды и RPC

Команды (`src/commands/`) на фреймворке `SpotterCommand` + `registry`. Домен-мутирующие (login-redeem, promote/demote/revoke/sign, event clear/info, deployment version) **не пишут в БД напрямую** — шлют `context.commandBus.send(kind, args, principalUuid)`. `CommandBus` ([src/command/CommandBus.ts](src/command/CommandBus.ts)) публикует `spotter.command.request` и ждёт коррелированный ответ на `spotter.command.reply` (один фоновый poll-loop, 30 s timeout, `instanceId` разделяет инстансы на общем reply-стриме).

Snapshot-команда камеры идёт по медиа-контракту: `spotter.camera.request.<source>` → `camera.staged` → depot → `spotter.camera.frame_processed` → `cameraFrameController`.

## БД (`src/db/`, drizzle/sqlite)

Telegram-локальный стейт — **никакого домена/ролей как источника истины**:

- `tg_chats (id PK)` — авторизованные чаты (получают уведомления через supplySubscribers).
- `tg_bindings ((tg_user_id, tg_chat_id) PK, recipient_uuid, username?, role)` — маппинг uuid↔chat + кэш роли для сессии (роль — копия, истина в server).
- `event_messages ((event_id, tg_chat_id) PK, message_id)` — какой message-id отправлен в какой чат (для edits и медиа-ответов).
- `service_versions ((node, service) PK, version, seen_at)` — последняя виденная версия каждого сервиса; нужна, чтобы выкат детектился и после рестарта самого бота.

После правок `schema.ts` — `bunx drizzle-kit generate` (миграции в `apps/telegram/drizzle/`).

## Состояние инфраструктуры (`src/status/`)

Сервисы шлют heartbeat в `spotter.heartbeat` раз в 30 секунд; `heartbeatController` раздаёт их двум потребителям:

- `HeartbeatRegistry` — последний удар на `node/service` в памяти, читается `/status`. Сервис не исчезает при молчании, а помечается протухшим (`HEARTBEAT_STALE_MS`).
- `RolloutWatcher` — сравнивает версию с сохранённой в `service_versions` и через `ROLLOUT_DEBOUNCE_MS` (90 с тишины) шлёт админам одно беззвучное сообщение на всю волну. Первый в жизни удар сервиса молчит — иначе установка отчиталась бы как выкат.

## Особенности

- Адресация: server присылает `recipients: uuid[]` / intent — telegram сам резолвит uuid в chatId по `tg_bindings`.
- `applicationLogger = defaultLogger.sub('telegram')`. Тесты глушат логи (`logger.disable()`).
- NVR-знания нет: рендер берёт лейблы из `CatalogCache` (`spotter.catalog.<source>`), display-код события приходит в самом `SpotterEvent`.
