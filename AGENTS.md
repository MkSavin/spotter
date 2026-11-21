# AGENTS.md — Spotter

Self-hosted управление NVR: Bun, Redis Streams, SQLite, S3; интерфейсы — Telegram, PWA, email, Appercot. Точки входа — `apps/*/src/index.ts`.

## Задача или симптом

| Задача или симптом | Читать |
| --- | --- |
| Не дошло событие или медиа | [Архитектура](.agents/architecture.md) |
| Запись зависла, повторяется, попала в DLQ; нужен стрим | [Транспорт](.agents/transport.md), [стримы](.agents/transport/streams.md) |
| Не запускается конфигурация | [Конфигурация](.agents/conventions/config.md) |
| Нужны правила кода, команд, тестов или комментариев | [Соглашения](.agents/conventions.md), [комментарии](.agents/comments.md) |
| Нужны схема БД или миграция | [Данные](.agents/data.md) |
| Не работает Appercot | [Appercot](.agents/appercot.md) |
| Нужен конкретный сервис | [Сервисы](.agents/services.md) |
| Рискованная правка или коммит | [Инварианты](.agents/invariants.md), [проверка](.agents/verification.md) |

## Never break

- NVR-креды читает только адаптер; между сервисами ходят S3-ключи. [Тест](.integration/invariants.test.ts).
- Фронтенды мутируют домен через `spotter.command.request`; их состояние не живёт в server. [Архитектура](.agents/architecture.md).
- `XACK` — после успеха; долгая работа сохраняется и ведётся вне записи Redis. [Транспорт](.agents/transport.md).
- Работа не ограничивается суммарной длительностью: обрыв — по тишине или зависанию. [Инварианты](.agents/invariants.md).
- Telegram получает файлы только в его лимитах; размеры едут в контракте. [Инварианты](.agents/invariants.md).
- Пакет объявляет каждую зависимость: образ ставит только объявленное. [Тест](.integration/workspaceDependencies.test.ts).
- Прод управляется через `./spotter`, не голым `docker compose`. [Проверка](.agents/verification.md).

## Команды

| Что | Команда |
| --- | --- |
| Запуск | `bun start`; сервис — `cd apps/<svc> && bun start` |
| Полная проверка | `bun run green` — типы, тесты, документация, Biome |
| Сквозные тесты | `bun run test:e2e` |
| Форматирование | `bunx biome check --write` |

Текущую структуру смотри через `ls`. Незакрытые проверки — в [todo](.agents/todo.md).
