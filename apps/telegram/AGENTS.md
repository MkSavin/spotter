# AGENTS.md — `@spotter/telegram`

Telegram-фронтенд доставки и взаимодействия. Консьюмит абстрактные delivery-команды от
server, рендерит HTML и шлёт/редактирует сообщения grammY; держит Telegram-локальный стейт
(чаты, биндинги uuid↔chat, message-id событий) и пресайнит обработанные S3-ключи в короткие
URL. Домен не трогает — мутации уходят в server по `spotter.command.request`. Общие
конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/telegram
bun start            # или bun start:watch
bun test
```
Нужен `.env.telegram` (см. [.env.telegram.example](../../.env.telegram.example)): `REDIS_URL`,
`REDIS_GROUP_ID` (`spotter-telegram`), `REDIS_CLIENT_ID`, `TELEGRAM_TOKEN`, `DATABASE_PATH`,
`SOURCE_ID`, `S3_*`, `S3_PRESIGN_EXPIRY`. NVR-кредов нет — S3 только для presign-байтов.

## Точка входа

[src/index.ts](src/index.ts) (`polling`): поднимает grammY `Bot` + `@grammyjs/runner`,
сессии (multi: `user`/`global`), `hydrate`/`parse-mode`, `attachInnoxious` (fallback-доставка
медиа), кэш биндингов в сессию. Параллельно — три Redis-подключения (`subscriber`,
выделенный `commandSubscriber` для `CommandBus`, `producer`), `CatalogCache`, и
`RedisRegulator` (группа `spotter-telegram`,
[src/transport/telegramTransport.ts](src/transport/telegramTransport.ts)):

- `spotter.delivery.event` → `deliveryEventController`
- `spotter.delivery.recipient` → `deliveryRecipientController`
- `spotter.camera.frame_processed` → `cameraFrameController`
- `spotter.catalog.updated` → `catalogController`

## Поток доставки

```
spotter.delivery.event ──▶ deliveryEventController ──▶ deliveryEventAction
   action create|update  → renderEvent → actualizeSentMessages (send/edit/удалить по чатам)
   action media          → presign clip/snapshotKey → InnoxiousMediaGroup → media group
```

- [deliveryEventAction.ts](src/transport/actions/deliveryEventAction.ts): сопоставляет
  подписанные чаты с уже отправленными `event_messages` через
  [supplySubscribers.ts](src/transport/helpers/supplySubscribers.ts) (create/update/remove),
  message-id хранит **локально** (server присылает только intent + recipients).
- `media`-экшен пресайнит S3-ключи (`s3.presign`, `S3_PRESIGN_EXPIRY`) — server байты не
  отдаёт. `InnoxiousMedia` доставляет с fallback (naive URL → accurate buffer).
- [deliveryRecipientController.ts](src/transport/controllers/deliveryRecipientController.ts)
  держит кэш `tg_bindings.role` в синхроне: `update` меняет роль, `revoke` сносит биндинги
  и осиротевшие чаты.

## Команды и RPC

Команды (`src/commands/`) на фреймворке `SpotterCommand` + `registry`. Домен-мутирующие
(login-redeem, promote/demote/revoke/sign, event clear/info, deployment version) **не пишут
в БД напрямую** — шлют `context.commandBus.send(kind, args, principalUuid)`. `CommandBus`
([src/command/CommandBus.ts](src/command/CommandBus.ts)) публикует `spotter.command.request`
и ждёт коррелированный ответ на `spotter.command.reply` (один фоновый poll-loop,
30 s timeout, `instanceId` разделяет инстансы на общем reply-стриме).

Snapshot-команда камеры идёт по медиа-контракту: `spotter.camera.request.<source>` →
`camera.staged` → depot → `spotter.camera.frame_processed` → `cameraFrameController`.

## БД (`src/db/`, drizzle/sqlite)

Telegram-локальный стейт — **никакого домена/ролей как источника истины**:

- `tg_chats (id PK)` — авторизованные чаты (получают уведомления через supplySubscribers).
- `tg_bindings ((tg_user_id, tg_chat_id) PK, recipient_uuid, username?, role)` — маппинг
  uuid↔chat + кэш роли для сессии (роль — копия, истина в server).
- `event_messages ((event_id, tg_chat_id) PK, message_id)` — какой message-id отправлен в
  какой чат (для edits и медиа-ответов).

После правок `schema.ts` — `bunx drizzle-kit generate` (миграции в `apps/telegram/drizzle/`).

## Особенности

- Адресация: server присылает `recipients: uuid[]` / intent — telegram сам резолвит uuid в
  chatId по `tg_bindings`.
- `applicationLogger = defaultLogger.sub('telegram')`. Тесты глушат логи (`logger.disable()`).
- NVR-знания нет: рендер берёт лейблы из `CatalogCache` (`spotter.catalog.<source>`),
  display-код события приходит в самом `SpotterEvent`.
