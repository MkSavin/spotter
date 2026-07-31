# AGENTS.md — `@spotter/depot`

Медиа-процессор. Ловит из Redis Streams застейдженное сырьё (S3-ключи), берёт байты из S3
по ключу, транскодит (ffmpeg / sharp), кладёт результат обратно в S3 и отвечает ключами.
NVR не знает — ходит только в S3. Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/depot
bun start            # или bun start:watch
bun test
```
Окружение: единый `.env` узла (см. [.env.example](../../.env.example) для single,
[.env.ingest.example](../../.env.ingest.example) для ingest). Сервис читает `REDIS_URL`,
`S3_HOST/ACCESS/SECRET/BUCKET`, `TZ`, `DIRECTORY_CLEANUP`, `VIDEO_*`, `IMAGE_QUALITY`;
consumer-группа (`spotter-depot`) — с дефолтом в коде.

> Сервис горизонтально масштабируется: запускают несколько инстансов (`depot-1`, `depot-2`)
> в **одной** consumer-группе (`spotter-depot`) с **разными** `REDIS_CLIENT_ID` — Redis раскидывает
> сообщения стрима между консьюмерами одной группы (по одному получателю на сообщение).
> В compose `REDIS_CLIENT_ID` каждой реплики задаётся inline через `environment:`,
> а общий `.env` подключается через `env_file`.

## Точка входа

[src/index.ts](src/index.ts): создаёт `S3Client` (Bun-нативный), два Redis-подключения
(`subscriber` для блокирующего `XREADGROUP` + `producer`/`StreamProducer`), поднимает общий
temp-каталог через `temp('spotter-depot-media-')`, регистрирует контроллеры в `RedisRegulator`
(группа `spotter-depot`):

- `spotter.media.staged` → `mediaStagedController`
- `spotter.camera.staged` → `cameraStagedController`

## Поток обработки

`controllers/*Controller.ts` (парсинг payload + ответ в `*_processed` через `producer.publish`)
→ `actions/*Action.ts` (оркестрация) → `processing/*` (реальная конвертация по S3-ключу).

```
mediaStagedController ──▶ mediaStagedAction ──▶ processStaged(video/image) ──▶ S3
                                                       │
                                       transcode.ts (ffmpeg/sharp)
```

- Клип и снимок обрабатываются параллельно (`Promise.all`) и **независимо ловят ошибки**
  (одна упавшая ветка не валит всю обработку — возвращает `undefined`).
- `processStaged` ([src/processing/processStaged.ts](src/processing/processStaged.ts)) — общая логика:
  скачать из S3 по `rawKey` → транскодировать (`transcode.ts`) → положить результат в S3,
  вернуть **ключ** (`processedPath`, `filePrefix`). URL/токены NVR не фигурируют.

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

- У depot **нет доступа к БД** — он stateless, общается только через Redis Streams и S3.
- depot **не знает NVR**: на вход приходят только S3-ключи застейдженного сырья (никаких URL/токенов).
- Долгие конвертации безопасны: сообщение остаётся pending до `XACK`, никто не вытесняет consumer.
  Держи `REDIS_RECLAIM_MIN_IDLE_MS` (по умолчанию 5 мин) выше самой долгой конвертации, иначе
  reaper перехватит ещё обрабатываемую запись и начнётся дубль.
