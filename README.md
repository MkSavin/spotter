# Spotter

> Система видеонаблюдения с уведомлениями в Telegram, построенная вокруг событий [Frigate NVR](https://frigate.video/).
>
> Внутреннее имя пакетов — `spotter` / `@spotter/*`.
>
> **Open-source self-hosting:** проект рассчитан на развёртывание у себя — любой может
> поднять Spotter на своём сервере. Конфигурация — через `.env` по сервисам и
> compose-профили (см. [Развёртывание](#развёртывание-docker)).

Когда камера фиксирует событие (человек, машина, животное), Frigate публикует его в MQTT.
Spotter подхватывает событие, отправляет уведомление в Telegram, по запросу обрабатывает
снимок/клип и присылает медиа прямо в чат.

## Архитектура

```
 Frigate NVR ──MQTT──▶  sink  ──Redis──▶  bot  ──▶ Telegram
                                  │  ▲
                                  ▼  │
                                 depot ──▶ S3
```

| Сервис             | Назначение                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **`apps/sink`**    | Мост NVR → Redis Streams. Подключаемый `Source` (Frigate/MQTT) ингестит события, нормализует в `SpotterEvent`, публикует в `spotter.event`. |
| **`apps/bot`**     | Telegram-бот (grammY). Реагирует на события, шлёт уведомления, обрабатывает команды операторов.   |
| **`apps/depot`**   | Медиа-процессор. Скачивает клипы/снимки с NVR, обрабатывает (ffmpeg/sharp), кладёт в S3.          |
| **`apps/forwarder`** | Двунаправленный мост Redis Streams local↔remote (store-and-forward). Нужен только в распределённом деплое — см. [Развёртывание](#развёртывание-docker). |
| **`packages/transport`** | Общие абстракции транспорта: `RedisRegulator`, `StreamProducer`, `env`, `resolveRedisConfig`, `bufferToJson`, контракт `SpotterEvent`. |
| **`packages/stenograph`** | Структурированный логгер с контекстными саб-логгерами.                                     |

**Топология деплоя.** Архитектура рассчитана на два сценария. Простой — **всё на
одной машине** с единым Redis (dev, небольшие инсталляции). Надёжный —
**распределённый**: сервисы разносятся на два узла, **ingest** (`sink`/`depot` +
локальный durable-Redis + `forwarder`) и **облачный** (главный Redis + `bot`),
связанные VPN-туннелем. `forwarder` — единственный компонент, держащий хрупкий
межсайтовый канал, и буферизует события при обрывах (`XACK`-после-успеха).

Распределённый режим решает проблему ненадёжного или ограниченного канала на
стороне ingest: локальный durable-Redis принимает события и медиа даже при
отсутствии связи, а `forwarder` досылает накопленное после восстановления. Пример
такого деплоя — edge-узел на нестабильном аплинке + облачный узел со стабильным
адресом (см. [Развёртывание](#развёртывание-docker)).

Подробности по каждому сервису — в его `AGENTS.md` (например, [apps/bot/AGENTS.md](apps/bot/AGENTS.md)).
Гайд для AI-ассистентов и общие конвенции — в корневом [AGENTS.md](AGENTS.md).

## Технический стек

- **Рантайм:** [Bun](https://bun.sh) 1.3.14 — запуск, тесты, сборка, S3-клиент
- **Монорепо:** Turborepo + workspaces (`apps/*`, `packages/*`)
- **Транспорт:** Redis Streams (встроенный `Bun.RedisClient`, consumer groups) + MQTT (Mosquitto)
- **БД:** SQLite (`bun:sqlite`) + Drizzle ORM (схема в [apps/bot/src/db/schema.ts](apps/bot/src/db/schema.ts))
- **Хранилище:** любое S3-совместимое (внешний провайдер или self-hosted MinIO/Garage)
- **Telegram:** grammY (+ `@grammyjs/commands`, `hydrate`, `parse-mode`, `runner`)
- **Качество:** Biome (линт + формат), Changesets (версии), commitlint

## Быстрый старт

### 1. Зависимости

```bash
bun install
```

### 2. Окружение

Для каждого сервиса заведите свой `.env`. Шаблоны лежат в корне:

```bash
cp .env.bot.example      .env.bot
cp .env.sink.example     .env.sink
cp .env.depot-1.example  .env.depot-1
```

Минимум для бота: `TELEGRAM_TOKEN`, `REDIS_URL`, `FRIGATE_REMOTE_URL` (БД — локальный
SQLite-файл по пути `DATABASE_PATH`, по умолчанию `./data/bot.sqlite`).

### 3. Инфраструктура (Docker)

```bash
bun run docker:dev          # redis + mosquitto (development-инфра)
# либо голым compose (docker-compose.yml — симлинк на dev-профиль):
docker compose up -d
```

> БД отдельным сервисом не нужна — это локальный SQLite-файл. Миграции Drizzle
> применяются автоматически при старте бота. Подробнее о split-деплое — в
> разделе [Развёртывание](#развёртывание-docker).

### 4. Запуск сервисов

```bash
bun start                   # все сервисы параллельно через turbo
bun start:watch             # то же, с авто-перезапуском (--watch)
```

Отдельный сервис:

```bash
cd apps/bot && bun start
```

## Команды

| Команда                     | Действие                                              |
| --------------------------- | ----------------------------------------------------- |
| `bun start`                 | Запустить все сервисы (`turbo run start --parallel`)   |
| `bun start:watch`           | Запуск с hot-reload                                    |
| `bun test`                  | Тесты во всех воркспейсах (`bun:test`)                 |
| `bun test:coverage`         | Тесты с покрытием                                      |
| `bun run build`             | Сборка всех сервисов (`bun build`)                     |
| `bun run typecheck`         | Проверка типов (`tsc --noEmit`)                        |
| `bun run sign:token`        | Подписать JWT-токен авторизации (см. ниже)             |
| `bunx biome check --write`  | Линт + автоформат                                      |
| `bun run docker:dev`        | Поднять dev-инфру (redis + mosquitto)                  |
| `bun run docker:single`     | Поднять весь прод-стек на одной машине (redis, mosquitto, sink, depot, bot) |
| `bun run docker:ingest`     | Поднять прод-узел ingest (local-redis, mosquitto, sink, depot×N, forwarder) |
| `bun run docker:cloud`      | Поднять прод-узел cloud (redis + bot)                  |

## Авторизация

Доступ к боту — по JWT-токену, подписанному секретом `AUTH_SECRET`. Выдать токен роли:

```bash
bun run sign:token admin          # роль admin
# или напрямую с явным секретом:
bun apps/bot/src/cli.ts sign admin -t <AUTH_SECRET>
```

Полученный токен оператор отправляет боту командой `/login <token>`.

## Redis Streams

Каждый стрим читается своей consumer-группой (`spotter-bot` / `spotter-depot` / `spotter-sink`).
Доставка — at-least-once: `XACK` после успешной обработки, зависшие записи перезабираются
`XAUTOCLAIM` (reaper). Группы создаются с позиции `$` — на рестарте старое не пересылается.

| Стрим                            | Кто пишет | Кто читает | Назначение                          |
| -------------------------------- | --------- | ---------- | ----------------------------------- |
| `spotter.event`                  | sink      | bot        | Событие камеры (start/update/end)   |
| `spotter.event.test_seed`        | bot       | sink       | Посев тестовых событий (`/test_publish`) |
| `spotter.event.media_requested`  | bot       | depot      | Запрос на обработку клипа/снимка     |
| `spotter.event.media_processed`  | depot     | bot        | URL обработанного медиа              |
| `spotter.camera.frame_requested` | bot       | depot      | Запрос актуального кадра камеры       |
| `spotter.camera.frame_processed` | depot     | bot        | URL обработанного кадра               |
| `frigate/events` *(MQTT)*        | Frigate   | sink       | Сырые события Frigate                 |

В распределённом деплое эти стримы зеркалируются между локальным и удалённым Redis
сервисом `forwarder` — направление см. в [apps/forwarder/src/streams.ts](apps/forwarder/src/streams.ts).

## Развёртывание (Docker)

Compose-файлы лежат в [.deployment/compose/](.deployment/compose/) и запускаются из
корня репозитория (важно для относительных путей к `.docker`/`.deployment`):

| Профиль | Команда | Что поднимает | Узлы |
| --- | --- | --- | --- |
| **development** | `bun run docker:dev` | `redis` + `mosquitto` (инфра; приложения — на хосте через `bun start`) | одна машина |
| **production · single** | `bun run docker:single` | весь стек в контейнерах: `redis`, `mosquitto`, `sink`, `depot`, `bot` (без `forwarder`) | одна машина |
| **production · ingest** | `bun run docker:ingest` | `local-redis` (durable), `mosquitto`, `sink`, `depot×N` (опц. GPU), `forwarder` | ingest-узел |
| **production · cloud** | `bun run docker:cloud` | `redis` (главный durable-буфер) + `bot` | облачный узел |

**Один узел (`single`)** — простейший прод: одна машина и ингестит с NVR, и ходит
в Telegram, единый Redis, `forwarder` не нужен.

**Распределённо (`ingest` + `cloud`)** — **две отдельные машины** (но обе можно
поднять и на одной для проверки). На ingest-узле `forwarder` зеркалит стримы в
удалённый Redis (`REDIS_REMOTE_URL`, через VPN-туннель между узлами) и обратно,
буферизуя всё в `local-redis` при обрывах. Выбирай этот режим, когда аплинк на
стороне ingest ненадёжен или ограничен.

S3 задаётся через `.env` (любой S3-совместимый бэкенд). Для ограниченных/цензурируемых
сетей в качестве туннеля ориентируйтесь на XRAY-VLESS или AmneziaWG 2 (см. дорожную карту).

## Структура репозитория

```
apps/
  bot/        Telegram-бот (grammY)
  depot/      Медиа-процессор (ffmpeg/sharp → S3)
  sink/       MQTT → Redis Streams мост
  forwarder/  Двунаправленный мост Redis Streams local↔remote (распределённый деплой)
packages/
  transport/   Абстракции транспорта (RedisRegulator) + контракт SpotterEvent + helpers
  stenograph/  Логгер
apps/bot/src/db/      SQLite-схема и репозиторий (Drizzle): chats, users, events
apps/bot/drizzle/     Сгенерированные миграции Drizzle
.deployment/compose/  Compose-профили: development, production.single, production.ingest, production.cloud
.deployment/          Конфиги инфраструктуры (mosquitto, …)
.env.*.example        Шаблоны окружения по сервисам
```

## Дорожная карта

- [x] ~~MongoDB + Prisma~~ → SQLite (`bun:sqlite`) + Drizzle
- [x] ~~Kafka~~ → Redis Streams (встроенный `Bun.RedisClient`, consumer groups)
- [x] Локальный durable-буфер + `forwarder` (store-and-forward между узлами)
- [x] Разнос compose на профили dev / single / ingest / cloud
- [ ] VPN-туннель между узлами (XRAY-VLESS / AmneziaWG 2 для ограниченных сетей); устойчивый канал bot↔Telegram
- [ ] `frigate/events` → `frigate/reviews` (нативный батчинг уведомлений)
- [ ] Видео по кнопке (генерация по таймкодам / папка-отстойник)
- [ ] Разделение `spotter/server` (бизнес-логика) + канал-адаптеры (`telegram`/`vk`/`max`/`ntfy`)
- [ ] Интеграция LGTM-стека (Loki / Grafana / Tempo / Mimir)
