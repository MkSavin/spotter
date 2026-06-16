# AGENTS.md — `@spotter/test`

Синтетический NVR-адаптер для **офлайн-разработки** на фреймворке [`@spotter/sink`](../../packages/sink).
Вместо реального NVR/MQTT — интерактивный REPL, который эмитит канонические `SpotterEvent` по
команде, и локальные фикстуры вместо медиа. Прогоняет весь пайплайн (request → staged →
processed → presign) без Frigate. Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/test
bun start            # или bun start:watch
bun test
```
Окружение слоёное: общий `.env` (`REDIS_URL`, `S3_*`, `TZ`) + тонкий `.env.test`
(см. [.env.test.example](../../.env.test.example)) поверх: `REDIS_GROUP_ID`, `SOURCE_ID`
(по умолч. `test`), `S3_STAGING_PREFIX`. NVR/MQTT/креды не нужны. Для локального S3
подними MinIO из dev-compose (`bun run docker:dev`).

## REPL-команды

[src/source/TestRepl.ts](src/source/TestRepl.ts) (commander + `node:readline`):

| Команда            | Действие                                                        |
| ------------------ | -------------------------------------------------------------- |
| `event [phase]`    | Эмитит событие. Без аргумента — полный цикл `start`→`end`; иначе одну фазу. |
| `camera [code]`    | Без аргумента — список камер + текущая; с аргументом — выбрать камеру. |
| `object [code]`    | Аналогично для объекта (лейбла события).                         |
| `exit` / `quit`    | Остановить адаптер (graceful shutdown через `SIGINT`).           |

`event` на фазе `end` ставит `hasClip`/`hasSnapshot` → запускается стейджинг фикстур и весь
медиа-пайплайн.

## Порты `@spotter/sink`

- `TestSource` ([src/source/TestSource.ts](src/source/TestSource.ts)) — вместо транспорта запускает REPL.
- `TestMediaProvider` ([src/media/TestMediaProvider.ts](src/media/TestMediaProvider.ts)) — отдаёт
  `file://`-`Request` на коммитнутые фикстуры (`data/clip.mp4`, `snapshot.jpg`, `frame.jpg`);
  рантайм фетчит и стейджит их в S3, как реальное медиа. Пути переопределяются `TEST_FIXTURE_*`.
- `TestCatalog` ([src/catalog/TestCatalog.ts](src/catalog/TestCatalog.ts)) — каталог из
  `config.labels` (без сети).

## Особенности

- Фикстуры `data/*` **коммитятся** (исключение в корневом `.gitignore`), сгенерированы ffmpeg.
- Адаптер чисто dev-инструмент; в прод-compose не входит.
- Новый сценарий = новая REPL-команда или правка фикстур, контракты не трогаем.
