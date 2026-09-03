# AGENTS.md — Spotter

Гайд для AI-ассистентов (Claude и др.). Цель — дать достаточно контекста, чтобы
вносить изменения быстро и в стиле проекта, не перечитывая весь код.

## TL;DR

- **Рантайм — только Bun.** Никаких `npm`/`node`/`ts-node`. Запуск: `bun start`, тесты: `bun test`.
- **Монорепо** на bun workspaces: 8 сервисов (`apps/*`, включая опциональные `email` и `pwa`) + 3 пакета (`packages/*`).
- **Связь между сервисами — через Redis Streams** (и MQTT на входе). Прямых вызовов между сервисами нет.
- **Стиль:** Biome — одинарные кавычки, без `;`, отступ 2 пробела. Запускай `bunx biome check --write` перед завершением.
- **Open-source self-hosting:** проект рассчитан на развёртывание сторонними людьми у себя.

## Архитектура потока данных

```
Frigate ─MQTT─▶ frigate ─Redis(spotter.event)─▶ server ─delivery.event─▶ telegram ──▶ Telegram
  (NVR)        (адаптер)        ▲                 │ ▲                       │ ▲
                  │ stage raw   └ request.<source>┘ │ *_processed           │ presign
                  ▼                                 │ (S3-ключи)            │
                 S3 ◀── transcode by key ── depot ──┘ ◀─────────────────────┘
                                          command.request/reply (telegram ⇄ server)
```

1. Frigate шлёт MQTT-событие → **frigate** (адаптер) парсит (`parseFrigateEvent`) → публикует в `spotter.event`; каталог камер/объектов — в `spotter.catalog.<source>`. Параллельно адаптер слушает `frigate/reviews` и штампует событию `severity` (`alert`/`detection`) — вердикт самого NVR, уже с учётом зон и фильтров из его конфига.
2. **server** (headless-домен) слушает `spotter.event`, персистит в БД (SQLite), публикует `spotter.delivery.event` (create/update). На `end` публикует `spotter.media.request.<source>` (`{eventId, source, want:[snapshot]}`) — **только фото eager, клип по запросу** — без обращения к NVR.
3. **frigate** ловит `*.request.<source>`, резолвит медиа (URL-схема + JWT живут **только** тут), стейджит сырьё в S3 и публикует `*.staged` (ключи S3).
4. **depot** ловит `*.staged`, берёт сырьё из S3 по ключу, транскодит (ffmpeg/`Bun.Image`), кладёт результат в S3, отвечает `*_processed` (ключи S3). NVR не знает. Снапшоты и клипы едут **разными стримами** (`spotter.media.staged` / `spotter.media.staged.clip`), чтобы долгий транскод видео не задерживал фото — какие читать, задаёт `DEPOT_LANE` (см. [apps/depot/AGENTS.md](apps/depot/AGENTS.md)).
5. **server** ловит `*_processed` и публикует `spotter.delivery.event` (action `media`, +S3-ключи). **telegram** консьюмит delivery-стрим, пресайнит ключи в короткоживущие URL и крепит медиа **на исходное сообщение** через `editMessageMedia` (текст → фото → видео). Креды NVR по сети не ходят — только ключи S3.
6. **Видео по кнопке:** под фото-сообщением — кнопка «Видео». Нажатие → telegram шлёт RPC `event.clip` → **server** запрашивает транскод клипа (`want:[clip]`) → готовый клип тем же путём проставляется видео всем подписчикам события (fan-out по `eventId`). Пока клип готовится, sink и depot шлют `spotter.media.progress` (`fetching`/`staged`/`failed`), и бот двигает по ним кнопку; провал или таймаут возвращают кнопку в состояние «повторить».
7. **Фронтенды домен не мутируют напрямую** — шлют `spotter.command.request` в server и ждут коррелированный `spotter.command.reply` (login/роли/event-команды). `CommandBus` живёт в `@spotter/transport` и используется и telegram, и pwa.
8. **Таймлапсы:** запрос идёт в `spotter.timelapse.request.<source>`, адаптер стартует экспорт в NVR и **сразу подтверждает** — сборка идёт минутами, дольше окна reclaim, и удержание записи привело бы к повторному экспорту. Пока идёт сборка, трекер шлёт `spotter.timelapse.progress`, и бот обновляет сообщение — экспорт за несколько суток идёт часами, и молчание неотличимо от зависания. Результат приходит на `spotter.timelapse.ready` / `.failed`.
8. **forwarder** (только распределённый деплой) — двунаправленно зеркалит стримы между локальным и удалённым Redis (store-and-forward, `XACK`-после-успеха). Сам бизнес-логику не трогает.

Абстракция NVR: вся специфика конкретного NVR изолирована в адаптере (`apps/frigate` на
`@spotter/sink`). `server`/`telegram`/`depot` работают через контракты медиа-пайплайна,
каталога и delivery из `@spotter/transport`. Для офлайн-разработки есть синтетический адаптер
`apps/test` (REPL + фикстуры).

Разделение домен/фронтенд (Part B): **server** — headless-домен и оркестрация
(события, медиа-пайплайн, recipients/авторизация, command-RPC); **telegram** — фронтенд
доставки (рендер, отправка/редактирование сообщений, Telegram-локальный стейт, presign).
Контракт между ними — `spotter.delivery.*` (downstream) и `spotter.command.*` (upstream).

Деплой-профили (dev / single / ingest / cloud) — в [docs/deployment.md](docs/deployment.md).

## Стримы

Каждый стрим читается своей consumer-группой — по одной на сервис (`spotter-server`,
`spotter-telegram`, `spotter-depot`, `spotter-frigate`, `spotter-pwa`, `spotter-email`,
`spotter-forwarder`, `spotter-test`). Доставка — at-least-once: `XACK` после успешной
обработки, зависшие записи перезабираются reaper'ом (`XPENDING IDLE` → `XCLAIM`). Группы
создаются с позиции `$` — на рестарте старое не пересылается. Запись, не осилившая
`REDIS_MAX_DELIVERIES` попыток, уходит в `<stream>.dead`.

| Стрим | Кто пишет | Кто читает | Назначение |
| --- | --- | --- | --- |
| `spotter.event` | frigate | server | Событие камеры (start/update/end) |
| `spotter.probe.request.<source>` | telegram | frigate | Показать NVR объект, чтобы он сам породил событие |
| `spotter.catalog.updated` | frigate | server, telegram, pwa | Снимок каталога камер/объектов |
| `spotter.catalog.request` | консьюмеры | frigate | Просьба переопубликовать каталог |
| `spotter.media.request.<source>` | server | frigate | Стейджинг медиа события |
| `spotter.media.staged` | frigate | depot | Снапшот застейджен (быстрая полоса) |
| `spotter.media.staged.clip` | frigate | depot | Клип застейджен (медленная полоса) |
| `spotter.event.media_processed` | depot | server | Ключи обработанного медиа |
| `spotter.media.progress` | frigate, depot | telegram | Стадия готовности клипа |
| `spotter.camera.request.<source>` | telegram, pwa | frigate | Запрос кадра камеры |
| `spotter.camera.staged` | frigate | depot | Кадр застейджен |
| `spotter.camera.frame_processed` | depot | telegram, pwa | Ключ обработанного кадра |
| `spotter.notifications.suspend.<source>` | telegram | frigate | Приглушить уведомления самого NVR |
| `spotter.timelapse.request.<source>` | telegram, pwa | frigate | Запрос экспорта таймлапса |
| `spotter.timelapse.progress` | frigate | telegram | Экспорт ещё идёт (сколько уже работает) |
| `spotter.timelapse.ready` | frigate | telegram, pwa | Экспорт готов, ключ в S3 |
| `spotter.timelapse.failed` | frigate | telegram, pwa | Экспорт не состоится, с причиной |
| `spotter.delivery.event` | server | telegram, pwa, email | Доставка события (create/update/media) |
| `spotter.delivery.recipient` | server | telegram, pwa | Изменение роли / отзыв доступа |
| `spotter.command.request` | telegram, pwa | server | Домен-мутирующая команда (RPC) |
| `spotter.command.reply` | server | telegram, pwa | Ответ, корреляция по `requestId` |
| `spotter.heartbeat` | все сервисы | telegram, pwa | Живость, версия и глубина очередей (`/status`) |
| `frigate/events` *(MQTT)* | Frigate | frigate | Сырые события NVR |
| `frigate/reviews` *(MQTT)* | Frigate | frigate | Вердикт NVR: alert или detection |

В распределённом деплое стримы зеркалирует `forwarder` — направление задаётся картой в
[apps/forwarder/src/streams.ts](apps/forwarder/src/streams.ts). Забыть стрим там значит,
что он молча не доедет: это ловит smoke на split-топологии.

## Команды

| Что               | Команда                                    |
| ----------------- | ------------------------------------------ |
| Запуск всего      | `bun start` / `bun start:watch`            |
| Запуск сервиса    | `cd apps/<svc> && bun start`               |
| **Зелёный чек**   | `/green` или `bun run green` — typecheck + тесты + biome по всему репо (~3 с) |
| Тесты             | `bun test` (или `cd apps/<svc> && bun test`) |
| Покрытие          | `bun test:coverage`                        |
| Сквозные тесты    | `bun run test:e2e` — настоящий Redis в Docker, обе топологии |
| Smoke             | `bun run smoke:build`, затем `bun run test:smoke` — реальные образы в compose |
| Линт + формат     | `bunx biome check --write`                 |
| Проверка типов    | `bun run typecheck` (`tsc --noEmit` по всему репо)      |
| Миграции БД       | `cd apps/<server\|telegram> && bunx drizzle-kit generate` |
| Токен авторизации | `bun run sign:token <role>`                |

## Ключевые конвенции

### Конфиг через `env`-хелпер
Каждый сервис собирает конфиг в `src/config.ts` функцией `resolveConfig`,
читая переменные через хелперы из `@spotter/transport`:

```ts
import { env, requireConfig, resolveRedisConfig } from '@spotter/transport'

env.string('REDIS_URL', 'redis://localhost:6379')
env.number('REDIS_BLOCK_MS', 5000)
env.enum('DIRECTORY_CLEANUP', strategies, 'file-processed')
env.boolean('FLAG', false)

// Общий REDIS_*-блок собирается одним хелпером из transport:
const redis = resolveRedisConfig({ group: 'spotter-server', clientId: 'spotter-server' })

// Fail-fast: один агрегирующий guard в конце resolveConfig вместо россыпи if-throw.
requireConfig({ REDIS_URL: redis.url, S3_HOST: s3.host, S3_SECRET: s3.secretKey })
```
`requireConfig` падает на старте с перечнем ВСЕХ недостающих переменных сразу.
**Не** читай `process.env` напрямую в бизнес-логике — только в `config.ts`.

### Единый `.env`
Один `.env` на узел — и dev (`bun --env-file=../../.env`), и compose
(`env_file: [./.env]`) грузят его целиком; лишние переменные сервис игнорирует.
Сетевые адреса (`REDIS_URL: redis://redis`) и per-replica `REDIS_CLIENT_ID` в
compose переопределяются через `environment:`. Consumer-группа, `DATABASE_PATH`,
`SOURCE_ID` — **дефолты в коде** (`config.ts`), в `.env` не выносятся; `REDIS_GROUP_ID`
в общий файл класть нельзя (перезапишет дефолт всем сервисам сразу). Шаблоны:
`.env.example` (single/dev, все сервисы), `.env.cloud.example` и `.env.ingest.example`
(узлы распределёнки). Креды NVR (`FRIGATE_*`) — ТОЛЬКО на ingest-узле, в cloud-`.env`
не выносить. Forwarder мостит два Redis (`REDIS_LOCAL_URL`/`REDIS_REMOTE_URL`), а не
`REDIS_URL`. Мастер первого запуска: `.integration/install.ts`.

### Паттерн Regulator
Подписка на сообщения декларативна, через builder:

```ts
const handle = await new RedisRegulator<Context>()
  .message('spotter.media.staged', mediaStagedController)
  .run(context, { group: config.redis.group, consumer: config.redis.consumer })
// context должен содержать { subscriber, producer, logger }; run() НЕ блокирует —
// возвращает { stop() }. Подключения держат процесс живым.
```
Аналогично `MqttRegulator` в адаптере (`.on('frigate/events', controller)`).

**Модель доставки:** `RedisRegulator` читает группой через `XREADGROUP` и делает `XACK`
**после** успешной обработки. Упавшее/зависшее сообщение остаётся в PEL; reaper (стартовый +
по таймеру) берёт зависшие записи через `XPENDING IDLE` → `XCLAIM` и повторяет. Группы создаются
с позиции `$` — на рестарте старые события заново не пересылаются. Heartbeat'ов нет (в отличие
от Kafka): держи `REDIS_RECLAIM_MIN_IDLE_MS` выше самой долгой операции (транскодинг).

**Рестарт Redis:** durable-инстанс на старте отвечает `-LOADING`, пока проигрывает AOF.
`XGROUP CREATE` ждёт этого (до 2 минут), а не падает — иначе сервис умирал ровно на том
рестарте, который призван пережить.

**Защита от poison-message:** `XPENDING` отдаёт счётчик доставок; запись, не обработанную успешно
за `REDIS_MAX_DELIVERIES` (по умолч. 5) раз, регулятор переносит в dead-letter-стрим `<stream>.dead`
(с полями `reason`/`deliveries`/`originalId` + оригинальный `value`) и `XACK`-ает оригинал — чтобы
битое сообщение не крутилось в PEL вечно. DLQ не подрезается: разбирай вручную (`XRANGE <stream>.dead - +`).

**Транзиентные vs окончательные ошибки:** ретрай работает только если обработчик **бросает**.
Проглоченная ошибка = `XACK` = потеря. Поэтому в depot сбои S3 и таймаут ffmpeg завёрнуты в
`TransientError` ([apps/depot/src/processing/TransientError.ts](apps/depot/src/processing/TransientError.ts))
и пробрасываются наружу — запись остаётся в PEL и уходит к reaper'у. Окончательный брак
(битый кодек, нечитаемое медиа) логируется и отвечает пустым результатом: ретраить нечего.

### Паттерн Controller → Action
- **Controller** (`*Controller.ts`): парсит сырьё (`bufferToJson(message.value)`), ранний `return` на мусоре,
  строит типизированный payload, делает работу, публикует ответ через `producer.publish`. **Без** бизнес-логики.
- **Action** (`*Action.ts`): чистая бизнес-логика на типизированном payload, возвращает результат для ответа.

```ts
const result = await someAction(payload, { ...context, logger })
if (!result) return
await producer.publish('...processed', result) // XADD в стрим; ack делает регулятор
```
Долгая работа безопасна: запись остаётся pending до `XACK`, никто не вытесняет consumer.

### Логирование (stenograph)
```ts
import { defaultLogger } from 'stenograph'
const logger = defaultLogger.sub('depot')              // в src/log.ts каждого сервиса
const sub = logger.sub('action', topic, event.id)      // контекстный саб-логгер на запрос
```
Уровни: `error`, `warn`, `info`, `verbose`, `debug`. В тестах вывод глушится **сам** —
`stenograph` вызывает `defaultLogger.disable()` при `NODE_ENV=test` (bun выставляет его
автоматически), так что руками в тестах это писать не нужно.

### Тесты
- Runner — `bun:test`. Файлы colocated рядом с кодом: `foo.ts` + `foo.test.ts`.
- Импорт: `import { test, expect, describe } from 'bun:test'`.
- FS-тесты используют уникальные temp-директории (`Date.now()` в имени) во избежание гонок.

## Данные (SQLite + Drizzle)

БД **разделена**: доменная — у server, у каждого фронтенда своя локальная (каждая со своим
`schema.ts` / `client.ts` (`createDatabase` + WAL + миграции на старте) / `repository.ts`,
принимающим `db` первым аргументом). Перекрёстных записей нет — чужой домен мутируется
только через `command.request`.

- **server** ([apps/server/src/db/](apps/server/src/db/)) — домен: `recipients` (uuid PK, роль,
  `tg_user_id?`/`username?`), `access_tokens` (одноразовые коды), `events` (снапшот NVR без message-id).
- **telegram** ([apps/telegram/src/db/](apps/telegram/src/db/)) — Telegram-локальный стейт:
  `tg_chats`, `tg_bindings` (составной PK `(tg_user_id, tg_chat_id)`, `recipient_uuid` + кэш роли),
  `event_messages` (составной PK `(event_id, tg_chat_id)`, `message_id`),
  `service_versions` (версии сервисов из heartbeat — для `/status` и уведомления о раскатке).
- **pwa** ([apps/pwa/src/db/](apps/pwa/src/db/)) — `push_subscriptions`, `notified_events` (дедуп), `recent_events` (лента), `devices` (авторизованные установки: токен + роль от домена), `timelapses` (запущенные экспорты, переживают рестарт).
- **email** ([apps/email/src/db/](apps/email/src/db/)) — `notified_events` (дедуп-леджер).

- Доступ к БД — **только через repository**, не дёргай drizzle из бизнес-логики/команд.
- `bun:sqlite` синхронный → функции репозитория возвращают значения, не промисы (`await` над ними безопасен).
- После правок `schema.ts` — `bunx drizzle-kit generate` в нужном сервисе (миграции в его `drizzle/`, применяются на старте).
- БД-файл задаётся `DATABASE_PATH` (по умолчанию `./data/<сервис>.sqlite` — `server` / `telegram` /
  `pwa` / `email`, относительно cwd). Дефолт в коде, в общий `.env` не выносится: одно значение
  на все сервисы столкнуло бы их в один файл.

## Стиль кода (Biome)

- Одинарные кавычки, **без точек с запятой**, отступ — 2 пробела.
- Импорты сортируются автоматически (`organizeImports`).
- `noExplicitAny` и `noForEach` **выключены** — `any` допустим там, где иначе никак.
- **Комментарии — только когда смысл кода не очевиден** (объясняют «почему», не дублируют код),
  коротко, простым языком и **на английском**. Компактный JSDoc в одну строку, а не простыня.
  Лишние комментарии — это техдолг на их поддержку. Полный регламент (в т.ч. языки:
  код — английский, документация/UI — русский) — в [CONTRIBUTING.md](CONTRIBUTING.md).
- Перед завершением задачи прогоняй `/green` (или `bun run green`) — typecheck, тесты и biome
  по всему репо за ~3 секунды.

## Подводные камни

- **Только Bun.** Скрипты, S3-клиент (`Bun.S3Client`), тест-раннер — всё на Bun API.
- **БД — локальный SQLite-файл** (`DATABASE_PATH`, cwd-относительно). Отдельного сервиса БД нет; миграции применяются на старте. Папка `drizzle/` каждого сервиса обязана ехать рядом с приложением (см. [apps/server/Dockerfile](apps/server/Dockerfile) / [apps/telegram/Dockerfile](apps/telegram/Dockerfile)).
- **Frigate шлёт «грязные» события** — контроллеры/парсеры делают ранний `return`/`throw`; сохраняй эту защиту.
- **Креды NVR — только в адаптере** (`apps/frigate`). По сети ходят S3-ключи, не байты и не токены. В `server`/`telegram`/`depot` не должно быть `frigate`/`jwt`/`clipUrl`/`cameraLabels`.
- **Домен/фронтенд не смешивать**: в `server` не должно быть grammy/рендера/Telegram-стейта; в `telegram` — доменной истины (роли/события как источник). Мутации домена из telegram — только через `command.request`.
- `DIRECTORY_CLEANUP` (depot) меняет очистку temp-файлов; `S3_PRESIGN_EXPIRY` (telegram) — срок жизни пресайн-URL — см. AGENTS.md сервисов.

## Карта сервисов

- [apps/server/AGENTS.md](apps/server/AGENTS.md) — headless-домен: события, медиа-оркестрация, recipients/авторизация, command-RPC.
- [apps/telegram/AGENTS.md](apps/telegram/AGENTS.md) — Telegram-фронтенд: delivery-консьюмер, команды, сессии, Innoxious-медиа, кэш каталога, пресайн S3.
- [apps/pwa/AGENTS.md](apps/pwa/AGENTS.md) — основной фронтенд: PWA + тонкий Bun-сервер, Web Push (VAPID), дедуп/коалесинг, лента/событие/сетап (опциональный).
- [apps/email/AGENTS.md](apps/email/AGENTS.md) — email-фронтенд: SMTP-консьюмер, одно письмо на событие, дедуп-леджер (опциональный, добавочный).
- [apps/depot/AGENTS.md](apps/depot/AGENTS.md) — транскод медиа из S3 по ключу, ffmpeg/`Bun.Image`.
- [apps/frigate/AGENTS.md](apps/frigate/AGENTS.md) — NVR-адаптер: `Source`/`MediaProvider`/`Catalog` на `@spotter/sink`.
- [apps/test/AGENTS.md](apps/test/AGENTS.md) — синтетический адаптер: REPL + локальные фикстуры (офлайн-разработка).
- [packages/transport](packages/transport) — общий слой: контракты стримов, `RedisRegulator`, `RedisConnection`, `CommandBus`, `CatalogCache`, `HeartbeatRegistry`, словарь ролей.
- [packages/sink](packages/sink) — фреймворк адаптера (`runSink`, порты `Source`/`MediaProvider`/`Catalog`/`TimelapseProvider`/`NotificationSuspender`, стейджинг в S3).
