# AGENTS.md — `@spotter/depot`

Медиа-процессор. Ловит из Kafka запросы на медиа, качает клипы/снимки/кадры с NVR,
обрабатывает (ffmpeg / sharp), загружает в S3 и отвечает URL'ами. Общие конвенции —
в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/depot
bun start            # или bun start:watch
bun test
```
Нужен `.env.depot-*` (см. `.env.depot-1.example`): `KAFKA_BROKERS`, `S3_HOST`,
`S3_ACCESS`, `S3_SECRET`, `S3_BUCKET`, `DIRECTORY_CLEANUP`.

> Сервис горизонтально масштабируется: запускают несколько инстансов (`depot-1`, `depot-2`)
> с разными `KAFKA_CLIENT_ID`/`KAFKA_GROUP_ID` — Kafka раскидывает партиции между ними.

## Точка входа

[src/index.ts](src/index.ts): создаёт `S3Client` (Bun-нативный), Kafka producer/consumer,
поднимает общий temp-каталог через `temp('spotter-depot-media-')`, регистрирует контроллеры в `KafkaRegulator`:

- `spotter.event.media_requested` → `eventMediaController`
- `spotter.camera.frame_requested` → `cameraFrameController`

## Поток обработки

`controllers/*Controller.ts` (парсинг payload + `intervalHeartbeat` + ответ в `*_processed`)
→ `actions/*Action.ts` (оркестрация) → `processing/*` (реальная конвертация).

```
eventMediaController ──▶ eventMediaAction ──▶ processVideo / processImage ──▶ processFile ──▶ S3
```

- `processVideo` / `processImage` запускаются параллельно (`Promise.all`) и **независимо ловят ошибки**
  (одна упавшая ветка не валит всю обработку — возвращает `undefined`).
- `processFile` ([src/processing/processFile.ts](src/processing/processFile.ts)) — общая логика:
  скачать → сконвертировать → положить в S3 (`s3Path`, `filePrefix`).

## Файловая система (`src/fs/`)

- `temp(prefix)` — создаёт уникальный temp-каталог (`fs.mkdtemp`), отдаёт контроллер с `.remove()`.
- `dir(path)` — создаёт/удаляет каталог по явному пути.
- `mime` — определение расширений/типов.

Оба контроллера каталогов идемпотентны: повторный `.remove()` безопасен. В тестах используй
**уникальные** пути (`Date.now()`), чтобы не ловить гонки на ФС.

`DIRECTORY_CLEANUP` управляет моментом очистки:
- `file-processed` — чистить сразу после обработки файла (по умолчанию);
- `process-exited` — чистить только при завершении процесса.

## Стек обработки

- **Видео:** `fluent-ffmpeg` (нужен ffmpeg в окружении / контейнере).
- **Изображения:** `sharp`.
- **S3:** `Bun.S3Client` — не тащи сторонние SDK, используй нативный клиент Bun.

## Особенности

- У depot **нет доступа к БД** — он stateless, общается только через Kafka и S3.
- Скачивание с NVR может требовать авторизации — она приходит в payload как `endpointAuthorization`.
- Долгие конвертации обязаны быть внутри `intervalHeartbeat`, иначе consumer вылетит из группы.
