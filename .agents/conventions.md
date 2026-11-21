# Соглашения разработки

## Код

Runtime и инструменты — только Bun: не используй `npm`, `node` или `ts-node`. Biome задаёт одинарные кавычки, отступ в два пробела, отсутствие `;` и порядок импортов. `noExplicitAny` и `noForEach` выключены, но применяй `any` только при необходимости.

Каждая импортируемая библиотека объявляется в `package.json` соответствующего пакета. Docker ставит зависимости через `bun install --filter`, поэтому глобально установленная зависимость не спасает образ.

Controller парсит сырьё и рано выходит на мусоре; Action содержит типизированную бизнес-логику. Ответ публикуется через `producer.publish`, ACK делает регулятор. Подробнее о времени жизни записи — в [transport](transport.md).

## Конфигурация

Переменные читаются только в `src/config.ts` через `env`, `requireConfig`, `resolveRedisConfig` и `resolveS3Config`. Единый `.env`, дефолты и правила для узлов — в [config](conventions/config.md).

## Логирование

```ts
import { defaultLogger } from 'stenograph'
const logger = defaultLogger.sub('depot')
const sub = logger.sub('action', topic, event.id)
```

Уровни: `error`, `warn`, `info`, `verbose`, `debug`. При `NODE_ENV=test` `stenograph` сам глушит вывод. Каждая точка входа вызывает `guardRejections` либо использует `runSink`, чтобы unhandled rejection не убивал процесс молча.

## Тесты

Runner — `bun:test`; тесты лежат рядом с кодом: `foo.ts` и `foo.test.ts`. Импорт — `import { test, expect, describe } from 'bun:test'`. Не используй `mock.module`: зависимости передаются параметром. FS-тесты получают уникальные temp-каталоги.

Новая логика начинается с теста, который падает без неё. Внешние системы на стыке проверяются настоящими компонентами. Полный порядок — в [verification](verification.md).

## Данные и документация

SQLite открывается через `createDatabase`, миграции применяются на старте, доступ идёт через repository. Схемы и владельцы — в [data](data.md).

Документация и UI — на русском, код и комментарии — на английском. Комментарий объясняет только неочевидную причину; полный регламент — в [comments](comments.md) и [CONTRIBUTING.md](../CONTRIBUTING.md).

После схемы запусти `bunx drizzle-kit generate` в сервисе. Перед завершением — `bun run green`; он также проверяет бюджет `AGENTS.md` и `.agents/**/*.md`.
