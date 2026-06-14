# AGENTS.md — Spotter

Гайд для AI-ассистентов (Claude и др.). Цель — дать достаточно контекста, чтобы
вносить изменения быстро и в стиле проекта, не перечитывая весь код.

## TL;DR

- **Рантайм — только Bun.** Никаких `npm`/`node`/`ts-node`. Запуск: `bun start`, тесты: `bun test`.
- **Монорепо** Turborepo: 3 сервиса (`apps/*`) + 2 пакета (`packages/*`).
- **Связь между сервисами — через Kafka** (и MQTT на входе). Прямых вызовов между сервисами нет.
- **Стиль:** Biome — одинарные кавычки, без `;`, отступ 2 пробела. Запускай `bunx biome check --write` перед завершением.

## Архитектура потока данных

```
Frigate ──MQTT(frigate/events)──▶ sink ──Kafka(spotter.event)──▶ bot ──▶ Telegram
                                                                  │ ▲
                                            spotter.*.requested   ▼ │  spotter.*.processed
                                                                 depot ──▶ S3/MinIO
```

1. Frigate шлёт MQTT-событие → **sink** парсит (`parseFrigateEvent`) → публикует в `spotter.event`.
2. **bot** слушает `spotter.event`, обновляет БД (SQLite), шлёт уведомление. На `end`-событиях запрашивает медиа.
3. **depot** ловит `*.media_requested` / `*.frame_requested`, качает с NVR, обрабатывает, кладёт в S3, отвечает `*_processed`.
4. **bot** ловит `*_processed` и отправляет медиа в Telegram-чат.

Топики целиком — в [README.md](README.md#kafka-топики).

## Команды

| Что               | Команда                                    |
| ----------------- | ------------------------------------------ |
| Запуск всего      | `bun start` / `bun start:watch`            |
| Запуск сервиса    | `cd apps/<svc> && bun start`               |
| Тесты             | `bun test` (или `cd apps/<svc> && bun test`) |
| Покрытие          | `bun test:coverage`                        |
| Линт + формат     | `bunx biome check --write`                 |
| Проверка типов    | `bun run typecheck` (`tsc --noEmit`)       |
| Миграции БД       | `cd apps/bot && bunx drizzle-kit generate` |
| Токен авторизации | `bun run sign:token <role>`                |

## Ключевые конвенции

### Конфиг через `env`-хелпер
Каждый сервис собирает конфиг в `src/config.ts` функцией `resolveConfig`,
читая переменные через хелперы из `@spotter/transport`:

```ts
import { env } from '@spotter/transport'

env.string('KAFKA_CLIENT_ID', 'default')
env.number('KAFKA_ACTION_HEARTBEAT', 3000)
env.stringArray('KAFKA_BROKERS', [])         // split по ','
env.enum('DIRECTORY_CLEANUP', strategies, 'file-processed')
env.boolean('FLAG', false)
```
`resolveConfig` сам бросает ошибку при отсутствии обязательных значений (брокеры, токен, БД).
**Не** читай `process.env` напрямую в бизнес-логике — только в `config.ts`.

### Паттерн Regulator
Подписка на сообщения декларативна, через builder:

```ts
await new KafkaRegulator<Context>()
  .message('spotter.event.media_requested', eventMediaController)
  .run(context)            // context должен содержать { consumer, producer }
```
Аналогично `MqttRegulator` в sink (`.on('frigate/events', controller)`).

### Паттерн Controller → Action
- **Controller** (`*Controller.ts`): парсит сырьё (`bufferToJson(message.value)`), ранний `return` на мусоре,
  строит типизированный payload, оборачивает работу в `intervalHeartbeat`, публикует ответ. **Без** бизнес-логики.
- **Action** (`*Action.ts`): чистая бизнес-логика на типизированном payload, возвращает результат для ответа.

```ts
await intervalHeartbeat(heartbeat, config.kafka, async () => {
  const result = await someAction(payload, { ...context, logger })
  if (!result) return
  await producer.send({ topic: '...processed', messages: [{ value: JSON.stringify(result) }] })
})
```
`intervalHeartbeat` обязателен для долгих операций (видео, скачивание) — иначе Kafka выкинет consumer из группы.

### Логирование (stenograph)
```ts
import { defaultLogger } from 'stenograph'
const logger = defaultLogger.sub('depot')              // в src/log.ts каждого сервиса
const sub = logger.sub('action', topic, event.id)      // контекстный саб-логгер на запрос
```
Уровни: `error`, `warn`, `info`, `verbose`, `debug`. В тестах глушим вывод: `defaultLogger.disable()`.

### Тесты
- Runner — `bun:test`. Файлы colocated рядом с кодом: `foo.ts` + `foo.test.ts`.
- Импорт: `import { test, expect, describe } from 'bun:test'`.
- FS-тесты используют уникальные temp-директории (`Date.now()` в имени) во избежание гонок.

## Данные (SQLite + Drizzle)

БД живёт только в **bot** ([apps/bot/src/db/](apps/bot/src/db/)): `schema.ts` (таблицы +
`Role` + типы), `client.ts` (`createDatabase` + WAL + миграции на старте), `repository.ts`
(сгруппированные `usersRepo` / `chatsRepo` / `eventsRepo`, принимают `db` первым аргументом).
Таблицы: `chats`, `users` (составной PK `(id, chat_id)`, роли `USER`/`ADMIN`), `events`,
`event_messages` (заменяет встроенный массив `Event.messages` из Mongo).

- Доступ к БД — **только через repository**, не дёргай drizzle из бизнес-логики/команд.
- `bun:sqlite` синхронный → функции репозитория возвращают значения, не промисы (`await` над ними безопасен).
- После правок `schema.ts` — `bunx drizzle-kit generate` (миграции в `apps/bot/drizzle/`, применяются при старте бота).
- БД-файл задаётся `DATABASE_PATH` (по умолчанию `./data/bot.sqlite`, относительно cwd).

## Стиль кода (Biome)

- Одинарные кавычки, **без точек с запятой**, отступ — 2 пробела.
- Импорты сортируются автоматически (`organizeImports`).
- `noExplicitAny` и `noForEach` **выключены** — `any` допустим там, где иначе никак.
- Перед завершением задачи прогоняй `bunx biome check --write` и `bun test`.

## Подводные камни

- **Только Bun.** Скрипты, S3-клиент (`Bun.S3Client`), тест-раннер — всё на Bun API.
- **БД — локальный SQLite-файл** (`DATABASE_PATH`, cwd-относительно). Отдельного сервиса БД нет; миграции применяются на старте бота. Папка `apps/bot/drizzle/` обязана ехать рядом с приложением (см. [apps/bot/Dockerfile](apps/bot/Dockerfile)).
- **Frigate шлёт «грязные» события** — контроллеры/парсеры делают ранний `return`/`throw`; сохраняй эту защиту.
- `MEDIA_STRATEGY=link` (bot) и `DIRECTORY_CLEANUP` (depot) меняют поведение медиа — см. AGENTS.md сервисов.

## Карта сервисов

- [apps/bot/AGENTS.md](apps/bot/AGENTS.md) — Telegram-бот, команды, сессии, Innoxious-медиа.
- [apps/depot/AGENTS.md](apps/depot/AGENTS.md) — обработка медиа, S3, ffmpeg/sharp.
- [apps/sink/AGENTS.md](apps/sink/AGENTS.md) — MQTT→Kafka мост, парсинг Frigate.
