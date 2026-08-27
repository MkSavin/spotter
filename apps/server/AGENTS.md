# AGENTS.md — `@spotter/server`

Headless-домен и оркестратор. Персистит события NVR, оркеструет медиа-пайплайн, владеет
авторизацией (recipients/access-токены) и исполняет домен-мутирующие команды по RPC.
Telegram (и любой будущий фронтенд) не знает — общается абстрактными контрактами
delivery/command. Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/server
bun start            # или bun start:watch
bun test
bun run sign:token   # CLI: выпустить access-код (src/cli.ts)
```
Окружение: единый `.env` узла (см. [.env.example](../../.env.example) для single,
[.env.cloud.example](../../.env.cloud.example) для cloud) — compose раздаёт его всем
контейнерам. Сервис читает `REDIS_URL`, `S3_HOST/ACCESS/SECRET/BUCKET`, `TZ`; consumer-группа
(`spotter-server`), `DATABASE_PATH` и `SOURCE_ID` — с дефолтами в коде (переопределяются
env при необходимости). NVR-кредов **нет** — сервер ходит только в Redis и S3.
`requireConfig` валидирует обязательное на старте.

## Точка входа

[src/index.ts](src/index.ts): создаёт `S3Client` (Bun-нативный), два Redis-подключения
(`subscriber` для блокирующего `XREADGROUP` + `producer`/`StreamProducer`), `CatalogCache`
(бутстрап каталога источника `SOURCE_ID`), регистрирует контроллеры в `RedisRegulator`
(группа `spotter-server`, [src/transport/serverTransport.ts](src/transport/serverTransport.ts)):

- `spotter.event` → `eventController`
- `spotter.event.media_processed` → `eventMediaController`
- `spotter.catalog.updated` → `catalogController` (общий, из `@spotter/transport` — как и `CatalogCache`)
- `spotter.command.request` → `commandController`

## Поток событий и медиа

```
spotter.event ──▶ eventController ──┬─▶ persist (eventsRepo.upsert)
                                    ├─▶ publish spotter.delivery.event (create|update)
                                    └─▶ (на end) publish
                                          spotter.media.request.<source> (want: [snapshot])
event.clip (RPC по кнопке) ──────▶ eventClipHandler
                                    └─▶ publish spotter.media.request.<source> (want: [clip])
spotter.event.media_processed ──▶ eventMediaController
                                    └─▶ publish spotter.delivery.event (action: media, +clip/snapshotKey)
```

- **`hasSnapshot` не проверяется.** Frigate пишет снапшот
  [в момент завершения трекинга](https://docs.frigate.video/configuration/snapshots/), поэтому
  на `end` флаг ещё `false` — фильтр по нему оставлял события без фото. Если снапшота правда
  нет, адаптер ответит пустым `mediaProcessed`.
- **Snapshot — eager, clip — по запросу.** На `end` запрашивается только `snapshot`;
  клип транскодится лениво, когда получатель жмёт кнопку «Видео» (команда `event.clip`,
  см. ниже). Так не транскодим клипы, которые никто не смотрит.
- [eventController.ts](src/transport/controllers/eventController.ts): идемпотентен —
  событие в статусе `end` повторно не обрабатывается. Медиа-запрос роутится **на источник
  события** (`mediaStreams.mediaRequest(source)`), а не на дефолтный `SOURCE_ID`.
- Сервер **не пресайнит и не качает байты** — он отдаёт `clipKey`/`snapshotKey` в
  `delivery.event`; presign делает telegram. И snapshot, и clip приходят отдельными
  `media_processed` → отдельными `delivery.event (media)`.

## Команды (RPC)

[commandController.ts](src/transport/controllers/commandController.ts) принимает
`spotter.command.request`, диспетчит по `kind` через реестр
[commands/handlers.ts](src/commands/handlers.ts) и отвечает в `spotter.command.reply`
(корреляция по `requestId`; неизвестный `kind` и исключения → `ok:false`).

Хендлеры: `login.redeem`, `user.setRole`, `user.revoke`, `user.sign`, `event.info`,
`event.clear`, `event.clip`. Мутации ролей/доступа дополнительно публикуют
`spotter.delivery.recipient`, чтобы telegram синхронизировал свой кэш биндингов.

`event.clip` (`{eventId}`) — on-demand клип по кнопке «Видео»: резолвит источник
сохранённого события и публикует `spotter.media.request.<source>` с `want:[clip]`.
Готовый клип возвращается обычным `media_processed` → `delivery.event (media)` путём.

## БД (`src/db/`, drizzle/sqlite)

Доменная половина бывшей БД бота — **никакого Telegram-специфичного стейта**:

- `recipients (uuid PK, role, tg_user_id?, username?)` — логические получатели; `tg_user_id`
  и `username` nullable (заполняются при первом логине через telegram).
- `access_tokens (id PK, role, username?)` — одноразовые коды (consume = delete).
- `events` — снапшот событий NVR (без message-id; трекинг сообщений живёт в telegram).

После правок `schema.ts` — `bunx drizzle-kit generate` (миграции в `apps/server/drizzle/`,
применяются на старте).

## Особенности

- Адресация получателей — **внутренним uuid**, сервер не знает про chatId/@username сверх
  того, что прислал фронтенд при логине.
- `event_messages` (TG message-id) сюда **не** переезжает — это стейт telegram.
- NVR-знания нет: на вход и выход идут только абстрактные контракты и S3-ключи.
