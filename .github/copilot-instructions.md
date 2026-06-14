# Spotter AI Agent Guidelines

## Архитектура проекта

Spotter — это система мониторинга видеонаблюдения на базе событий. Монорепозиторий Turborepo с тремя основными микросервисами:

- **bot** (Telegram фронтенд) — grammy бот, принимает Kafka события, отправляет уведомления, команды управления камерами
- **depot** (Медиа процессор) — получает запросы на обработку медиа, скачивает видео/снимки, обрабатывает через ffmpeg/sharp, загружает в S3, отправляет URL обратно в Kafka
- **sink** (MQTT → Kafka мост) — слушает MQTT топик `frigate/events`, парсит события Frigate NVR, публикует в Kafka `spotter.event`

Общие пакеты:
- `@spotter/transport` — абстракции Kafka (KafkaRegulator, intervalHeartbeat, kafkaLogging)
- `stenograph` — структурированный логгер с форматерами

## Ключевые топики Kafka

- `spotter.event` — события камеры (start/update/end) от Frigate
- `spotter.event.media_requested` — depot запрос на обработку клипа/снимка
- `spotter.event.media_processed` — depot ответ с URL обработанных файлов
- `spotter.camera.frame_requested` — запрос последнего кадра камеры
- `spotter.camera.frame_processed` — depot ответ с URL обработанного кадра

## Паттерны кода

### Event flow
1. Frigate отправляет MQTT событие → sink парсит → Kafka `spotter.event`
2. bot подписан на `spotter.event`, обновляет БД (SQLite/Drizzle), отправляет уведомления в Telegram
3. Для событий типа `end`: bot запрашивает медиа → Kafka `spotter.event.media_requested` → depot скачивает/обрабатывает → `spotter.event.media_processed` → bot отправляет в чат

### KafkaRegulator pattern
```typescript
await new KafkaRegulator<Context>()
  .message('topic.name', controllerFunction)
  .run(context)
```
Регистрирует обработчики для топиков, автоматически subscribe и eachMessage loop.

### Controller → Action pattern
- **Controllers** (`*Controller.ts`) — парсят Kafka сообщения, вызывают `intervalHeartbeat` для keep-alive, делегируют бизнес-логику в actions
- **Actions** (`*Action.ts`) — чистая бизнес-логика, получают типизированный payload

### Media sending (Innoxious extension)
grammy API расширен через `attachInnoxious(bot.api)`. Использует стратегии:
- `.naive()` — отправляет URL напрямую (минимальный трафик)
- `.accurate()` — скачивает в Buffer, отправляет как файл (гарантированная доставка)

Пример:
```typescript
const media = new InnoxiousMediaGroup([{ type: 'photo', media: url }])
await bot.api.innoxious.sendMediaGroup(chatId, media)
```

## Технический стек

- **Рантайм:** Bun 1.2.4 (все `bun run`, `bun test`)
- **БД:** SQLite (`bun:sqlite`) + Drizzle ORM, только в боте (схема/репозиторий в `apps/bot/src/db/`)
- **Инфраструктура:** Kafka (KRaft mode, cluster ID: `q8RkVBbMQYel-fULGNEbNQ`), MQTT (Mosquitto), MinIO (S3-совместимое хранилище)
- **Билд:** Turbo (кеширование), Biome (линтер), Changesets (версионирование)

## Конвенции

- Тесты: colocated `*.test.ts`, Bun test runner, отключать логи через `defaultLogger.disable()`
- Конфиг: env переменные парсятся через `env.string()` / `env.number()` / `env.stringArray()` из `@spotter/transport`
- Логирование: `stenograph` с контекстными сабреггерами `logger.sub('module', 'eventId')`
- Интервалы Kafka heartbeat: `intervalHeartbeat(heartbeat, config.kafka, async () => { ... })` внутри контроллеров

## Команды

- **Разработка:** `bun start` (или `bun start:watch`) — запускает все сервисы через turbo
- **Тесты:** `bun test` (рекурсивно все `*.test.ts`)
- **Билд:** `bun run build` (`bun build` по каждому сервису)
- **Подпись токена:** `bun run sign:token <role>` (или `bun apps/bot/src/cli.ts sign <role> -t <AUTH_SECRET>`)

> Полный гайд для AI-ассистентов — в корневом [AGENTS.md](../AGENTS.md) и `AGENTS.md` каждого сервиса.

## Важные файлы

- `apps/bot/src/db/schema.ts` — таблицы SQLite (chats, users, events, event_messages) + Role
- `apps/bot/src/extension/innoxious/` — стратегии отправки медиа с retry логикой
- `packages/transport/src/regulator/KafkaRegulator.ts` — абстракция Kafka consumer
- `.env.bot.example` / `.env.depot.example` / `.env.sink.example` — шаблоны env
- `turbo.json` — граф зависимостей задач, persistent dev режим

## Подводные камни

- Frigate иногда отправляет баговые события с `position_changes === 0` → sink пропускает их
- БД — локальный SQLite-файл (`DATABASE_PATH`); отдельного сервиса БД нет, миграции Drizzle применяются на старте бота
- Тесты `dir.ts` могут падать при параллельном запуске (race condition на FS) → использовать уникальные temp директории
- Kafka heartbeat критичен для долгих операций (обработка видео) → всегда оборачивать в `intervalHeartbeat`
