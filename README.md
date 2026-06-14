# Spotter

> Система видеонаблюдения с уведомлениями в Telegram, построенная вокруг событий [Frigate NVR](https://frigate.video/).
>
> Внутреннее имя пакетов — `spotter` / `@spotter/*`.

Когда камера фиксирует событие (человек, машина, животное), Frigate публикует его в MQTT.
Spotter подхватывает событие, отправляет уведомление в Telegram, по запросу обрабатывает
снимок/клип и присылает медиа прямо в чат.

## Архитектура

```
 Frigate NVR ──MQTT──▶  sink  ──Kafka──▶  bot  ──▶ Telegram
                                  │  ▲
                                  ▼  │
                                 depot ──▶ S3 / MinIO
```

| Сервис             | Назначение                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **`apps/sink`**    | Мост MQTT → Kafka. Слушает `frigate/events`, парсит события Frigate, публикует в `spotter.event`. |
| **`apps/bot`**     | Telegram-бот (grammY). Реагирует на события, шлёт уведомления, обрабатывает команды операторов.   |
| **`apps/depot`**   | Медиа-процессор. Скачивает клипы/снимки с NVR, обрабатывает (ffmpeg/sharp), кладёт в S3.          |
| **`packages/transport`** | Общие абстракции Kafka: `KafkaRegulator`, `env`, `intervalHeartbeat`, `bufferToJson`.      |
| **`packages/stenograph`** | Структурированный логгер с контекстными саб-логгерами.                                     |

Подробности по каждому сервису — в его `AGENTS.md` (например, [apps/bot/AGENTS.md](apps/bot/AGENTS.md)).
Гайд для AI-ассистентов и общие конвенции — в корневом [AGENTS.md](AGENTS.md).

## Технический стек

- **Рантайм:** [Bun](https://bun.sh) 1.2.4 — запуск, тесты, сборка, S3-клиент
- **Монорепо:** Turborepo + workspaces (`apps/*`, `packages/*`)
- **Транспорт:** Kafka (KRaft mode, KafkaJS) + MQTT (Mosquitto)
- **БД:** SQLite (`bun:sqlite`) + Drizzle ORM (схема в [apps/bot/src/db/schema.ts](apps/bot/src/db/schema.ts))
- **Хранилище:** S3 / MinIO
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

Минимум для бота: `TELEGRAM_TOKEN`, `KAFKA_BROKERS`, `FRIGATE_REMOTE_URL` (БД — локальный
SQLite-файл по пути `DATABASE_PATH`, по умолчанию `./data/bot.sqlite`).

### 3. Инфраструктура (Docker)

```bash
bun run docker:dev          # симлинк docker-compose.yml → development
docker compose up -d        # kafka, kafka-ui, mosquitto
```

> БД отдельным сервисом не нужна — это локальный SQLite-файл. Миграции Drizzle
> применяются автоматически при старте бота.

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
| `bun run docker:dev`        | Переключить compose на development                     |
| `bun run docker:prod`       | Переключить compose на production                      |

## Авторизация

Доступ к боту — по JWT-токену, подписанному секретом `AUTH_SECRET`. Выдать токен роли:

```bash
bun run sign:token admin          # роль admin
# или напрямую с явным секретом:
bun apps/bot/src/cli.ts sign admin -t <AUTH_SECRET>
```

Полученный токен оператор отправляет боту командой `/login <token>`.

## Kafka-топики

| Топик                            | Кто пишет | Кто читает | Назначение                          |
| -------------------------------- | --------- | ---------- | ----------------------------------- |
| `spotter.event`                  | sink      | bot        | Событие камеры (start/update/end)   |
| `spotter.event.media_requested`  | bot       | depot      | Запрос на обработку клипа/снимка     |
| `spotter.event.media_processed`  | depot     | bot        | URL обработанного медиа              |
| `spotter.camera.frame_requested` | bot       | depot      | Запрос актуального кадра камеры       |
| `spotter.camera.frame_processed` | depot     | bot        | URL обработанного кадра               |
| `frigate/events` *(MQTT)*        | Frigate   | sink       | Сырые события Frigate                 |

## Структура репозитория

```
apps/
  bot/      Telegram-бот (grammY)
  depot/    Медиа-процессор (ffmpeg/sharp → S3)
  sink/     MQTT → Kafka мост
packages/
  transport/   Абстракции Kafka + общие helpers
  stenograph/  Логгер
apps/bot/src/db/   SQLite-схема и репозиторий (Drizzle): chats, users, events
apps/bot/drizzle/  Сгенерированные миграции Drizzle
.deployment/   Конфиги инфраструктуры (mosquitto, minio, …)
.env.*.example Шаблоны окружения по сервисам
```

## Дорожная карта

- [x] ~~MongoDB + Prisma~~ → SQLite (`bun:sqlite`) + Drizzle
- [ ] Заменить Kafka на Redis Streams (облегчить инфраструктуру)
- [ ] Интеграция LGTM-стека (Loki / Grafana / Tempo / Mimir)
