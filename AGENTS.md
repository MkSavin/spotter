# AGENTS.md — Spotter

Гайд для AI-ассистентов (Claude и др.). Цель — дать достаточно контекста, чтобы
вносить изменения быстро и в стиле проекта, не перечитывая весь код.

## TL;DR

- **Рантайм — только Bun.** Никаких `npm`/`node`/`ts-node`. Запуск: `bun start`, тесты: `bun test`.
- **Монорепо** Turborepo: 5 сервисов (`apps/*`) + 3 пакета (`packages/*`).
- **Связь между сервисами — через Redis Streams** (и MQTT на входе). Прямых вызовов между сервисами нет.
- **Стиль:** Biome — одинарные кавычки, без `;`, отступ 2 пробела. Запускай `bunx biome check --write` перед завершением.
- **Open-source self-hosting:** проект рассчитан на развёртывание сторонними людьми у себя.

## Архитектура потока данных

```
Frigate ─MQTT─▶ frigate ─Redis(spotter.event)─▶ bot ──▶ Telegram
  (NVR)        (адаптер)        ▲                 │ ▲
                  │ stage raw   └ request.<source>┘ │ presign
                  ▼                                 │
                 S3 ◀── transcode by key ── depot ──┘ (*_processed = S3-ключи)
```

1. Frigate шлёт MQTT-событие → **frigate** (адаптер) парсит (`parseFrigateEvent`) → публикует в `spotter.event`; каталог камер/объектов — в `spotter.catalog.<source>`.
2. **bot** слушает `spotter.event`, обновляет БД (SQLite), шлёт уведомление. На `end` публикует `spotter.media.request.<source>` (`{eventId, source, want}`) — без обращения к NVR.
3. **frigate** ловит `*.request.<source>`, резолвит медиа (URL-схема + JWT живут **только** тут), стейджит сырьё в S3 и публикует `*.staged` (ключи S3).
4. **depot** ловит `*.staged`, берёт сырьё из S3 по ключу, транскодит (ffmpeg/sharp), кладёт результат в S3, отвечает `*_processed` (ключи S3). NVR не знает.
5. **bot** ловит `*_processed`, пресайнит S3-ключи в короткоживущие URL и отправляет медиа в Telegram. Креды NVR по сети не ходят — только ключи S3.
6. **forwarder** (только распределённый деплой) — двунаправленно зеркалит стримы между
   локальным и удалённым Redis (store-and-forward, `XACK`-после-успеха). Сам бизнес-логику не трогает.

Абстракция NVR: вся специфика конкретного NVR изолирована в адаптере (`apps/frigate` на
`@spotter/sink`). `bot`/`depot` работают через контракты медиа-пайплайна и каталога из
`@spotter/transport`. Для офлайн-разработки есть синтетический адаптер `apps/test` (REPL + фикстуры).

Стримы (= имена топиков) целиком — в [README.md](README.md#redis-streams). Деплой-профили
(dev / single / ingest / cloud) — в [README.md](README.md#развёртывание-docker).

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
import { env, resolveRedisConfig } from '@spotter/transport'

env.string('REDIS_URL', 'redis://localhost:6379')
env.number('REDIS_BLOCK_MS', 5000)
env.enum('DIRECTORY_CLEANUP', strategies, 'file-processed')
env.boolean('FLAG', false)

// Общий REDIS_*-блок собирается одним хелпером из transport:
const redis = resolveRedisConfig({ group: 'spotter-bot', clientId: 'spotter-bot' })
```
`resolveConfig` сам бросает ошибку при отсутствии обязательных значений (`REDIS_URL`, токен, БД).
**Не** читай `process.env` напрямую в бизнес-логике — только в `config.ts`.

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

**Защита от poison-message:** `XPENDING` отдаёт счётчик доставок; запись, не обработанную успешно
за `REDIS_MAX_DELIVERIES` (по умолч. 5) раз, регулятор переносит в dead-letter-стрим `<stream>.dead`
(с полями `reason`/`deliveries`/`originalId` + оригинальный `value`) и `XACK`-ает оригинал — чтобы
битое сообщение не крутилось в PEL вечно. DLQ не подрезается: разбирай вручную (`XRANGE <stream>.dead - +`).

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
- **Комментарии — только когда они действительно нужны** (объясняют «почему», не дублируют код).
  Над функциями/методами/переменными — компактный JSDoc (`/** ... */`), а не строчные `//`.
  Лишние комментарии — это техдолг на их поддержку.
- Перед завершением задачи прогоняй `bunx biome check --write` и `bun test`.

## Подводные камни

- **Только Bun.** Скрипты, S3-клиент (`Bun.S3Client`), тест-раннер — всё на Bun API.
- **БД — локальный SQLite-файл** (`DATABASE_PATH`, cwd-относительно). Отдельного сервиса БД нет; миграции применяются на старте бота. Папка `apps/bot/drizzle/` обязана ехать рядом с приложением (см. [apps/bot/Dockerfile](apps/bot/Dockerfile)).
- **Frigate шлёт «грязные» события** — контроллеры/парсеры делают ранний `return`/`throw`; сохраняй эту защиту.
- **Креды NVR — только в адаптере** (`apps/frigate`). По сети ходят S3-ключи, не байты и не токены. В `bot`/`depot` не должно быть `frigate`/`jwt`/`clipUrl`/`cameraLabels`.
- `DIRECTORY_CLEANUP` (depot) меняет очистку temp-файлов; `S3_PRESIGN_EXPIRY` (bot) — срок жизни пресайн-URL — см. AGENTS.md сервисов.

## Карта сервисов

- [apps/bot/AGENTS.md](apps/bot/AGENTS.md) — Telegram-бот, команды, сессии, Innoxious-медиа, кэш каталога, пресайн S3.
- [apps/depot/AGENTS.md](apps/depot/AGENTS.md) — транскод медиа из S3 по ключу, ffmpeg/sharp.
- [apps/frigate/AGENTS.md](apps/frigate/AGENTS.md) — NVR-адаптер: `Source`/`MediaProvider`/`Catalog` на `@spotter/sink`.
- [apps/test/AGENTS.md](apps/test/AGENTS.md) — синтетический адаптер: REPL + локальные фикстуры (офлайн-разработка).
- [packages/sink](packages/sink) — фреймворк адаптера (`runSink`, порты, стейджинг в S3).
