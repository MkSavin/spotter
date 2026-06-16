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
 Frigate ─MQTT─▶  frigate  ─Redis Streams─▶  bot  ─▶ Telegram
   (NVR)         (адаптер)        ▲           │
                    │             └─ request ─┘
                    │ stage raw                ▲
                    ▼                          │ presign processed
                   S3  ◀── transcode by key ── depot
```

Вся специфика NVR изолирована в адаптере (`apps/frigate`): только он знает URL-схемы
и держит креды Frigate. Адаптер стейджит сырое медиа в S3 — по сети ходят **ключи
S3, не байты и не токены**. `bot`/`depot` работают через абстрактные контракты
(`spotter.media.request.<source>` → `*.staged` → `*_processed`); каталог камер/объектов
адаптер публикует в `spotter.catalog.<source>`, бот его кэширует.

| Сервис             | Назначение                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **`apps/frigate`** | NVR-адаптер. `Source` (Frigate/MQTT) ингестит события в `spotter.event`; `MediaProvider` стейджит клип/снимок/кадр в S3 по запросу; `Catalog` публикует таксономию. Единственный держатель кредов Frigate. |
| **`apps/test`**    | Синтетический адаптер для офлайн-разработки: REPL эмитит события, медиа берётся из локальных фикстур. NVR/MQTT не нужны. |
| **`apps/bot`**     | Telegram-бот (grammY). Реагирует на события, шлёт уведомления, обрабатывает команды операторов; пресайнит обработанные S3-ключи для Telegram. |
| **`apps/depot`**   | Медиа-процессор. Берёт сырое медиа из S3 по ключу, транскодит (ffmpeg/sharp), кладёт результат обратно в S3. NVR не знает. |
| **`apps/forwarder`** | Двунаправленный мост Redis Streams local↔remote (store-and-forward). Нужен только в распределённом деплое — см. [Развёртывание](#развёртывание-docker). |
| **`packages/sink`** | Фреймворк адаптера: порты `Source`/`MediaProvider`/`Catalog`, рантайм `runSink` (стейджинг в S3, публикация событий/каталога). |
| **`packages/transport`** | Общие абстракции транспорта: `RedisRegulator`, `StreamProducer`, `env`, `resolveRedisConfig`, `bufferToJson`, контракты `SpotterEvent` / медиа-пайплайна / каталога. |
| **`packages/stenograph`** | Структурированный логгер с контекстными саб-логгерами.                                     |

**Топология деплоя.** Архитектура рассчитана на два сценария. Простой — **всё на
одной машине** с единым Redis (dev, небольшие инсталляции). Надёжный —
**распределённый**: сервисы разносятся на два узла, **ingest** (`frigate`/`depot` +
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
- **Telegram:** grammY (+ `hydrate`, `parse-mode`, `runner`); своя система команд (классы + роли)
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
cp .env.frigate.example  .env.frigate
cp .env.depot-1.example  .env.depot-1
```

Минимум для бота: `TELEGRAM_TOKEN`, `REDIS_URL`, `S3_*` (для пресайна обработанного
медиа; бот **не** держит креды NVR). БД — локальный SQLite-файл по пути
`DATABASE_PATH` (по умолчанию `./data/bot.sqlite`). Креды Frigate и S3-стейджинг —
в `.env.frigate`. Для офлайн-разработки без Frigate: `cp .env.test.example .env.test`
и адаптер `apps/test`.

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
| `bun run sign:token`        | Создать код доступа (см. ниже)                         |
| `bunx biome check --write`  | Линт + автоформат                                      |
| `bun run docker:dev`        | Поднять dev-инфру (redis + mosquitto)                  |
| `bun run docker:single`     | Поднять весь прод-стек на одной машине (redis, mosquitto, frigate, depot, bot) |
| `bun run docker:ingest`     | Поднять прод-узел ingest (local-redis, mosquitto, frigate, depot×N, forwarder) |
| `bun run docker:cloud`      | Поднять прод-узел cloud (redis + bot)                  |

## Авторизация

Роли: `anonymous → viewer → user → admin`. Новый пользователь всегда получает роль
`viewer` (только нотификации); роль повышает админ командами `/user_promote` / `/user_demote`.

Доступ — по одноразовым кодам, хранящимся в БД (таблица `access_tokens`). Первого админа
создаёт CLI (БД задаётся `DATABASE_PATH`):

```bash
bun run sign:token admin                       # код доступа для роли admin
# опции: -u <username> (привязка к @username), -b <bot> (добавить deep-link), -r (только код)
bun apps/bot/src/cli.ts sign admin -b <bot_username>
```

Активация: оператор отправляет боту `/login <код>` либо открывает deep-link из QR-кода
(`https://t.me/<bot>?start=<код>` → автологин через `/start`). Код одноразовый.
Внутри бота админ выдаёт коды (роли `viewer`) командой `/user_sign [@username?]` —
бот присылает QR-код с deep-link.

## Redis Streams

Каждый стрим читается своей consumer-группой (`spotter-bot` / `spotter-depot` / `spotter-frigate`).
Доставка — at-least-once: `XACK` после успешной обработки, зависшие записи перезабираются
`XAUTOCLAIM` (reaper). Группы создаются с позиции `$` — на рестарте старое не пересылается.

Медиа-пайплайн абстрактен: бот шлёт запрос в per-source стрим, адаптер стейджит
сырьё в S3, depot транскодит по ключу. По сети ходят только S3-ключи.

| Стрим                              | Кто пишет | Кто читает | Назначение                          |
| ---------------------------------- | --------- | ---------- | ----------------------------------- |
| `spotter.event`                    | frigate   | bot        | Событие камеры (start/update/end)   |
| `spotter.event.test_seed`          | bot       | frigate    | Посев тестовых событий (`/test_publish`) |
| `spotter.catalog.updated`          | frigate   | bot        | Снимок каталога камер/объектов       |
| `spotter.media.request.<source>`   | bot       | frigate    | Запрос на стейджинг клипа/снимка события |
| `spotter.media.staged`             | frigate   | depot      | Сырьё события застейджено в S3 (ключи) |
| `spotter.event.media_processed`    | depot     | bot        | Ключи обработанного медиа в S3       |
| `spotter.camera.request.<source>`  | bot       | frigate    | Запрос на стейджинг кадра камеры      |
| `spotter.camera.staged`            | frigate   | depot      | Кадр застейджен в S3 (ключ)          |
| `spotter.camera.frame_processed`   | depot     | bot        | Ключ обработанного кадра в S3         |
| `frigate/events` *(MQTT)*          | Frigate   | frigate    | Сырые события Frigate                 |

В распределённом деплое эти стримы зеркалируются между локальным и удалённым Redis
сервисом `forwarder` — направление см. в [apps/forwarder/src/streams.ts](apps/forwarder/src/streams.ts).

## Развёртывание (Docker)

Compose-файлы лежат в [.deployment/compose/](.deployment/compose/) и запускаются из
корня репозитория (важно для относительных путей к `.docker`/`.deployment`):

| Профиль | Команда | Что поднимает | Узлы |
| --- | --- | --- | --- |
| **development** | `bun run docker:dev` | `redis` + `mosquitto` (инфра; приложения — на хосте через `bun start`) | одна машина |
| **production · single** | `bun run docker:single` | весь стек в контейнерах: `redis`, `mosquitto`, `frigate`, `depot`, `bot` (без `forwarder`) | одна машина |
| **production · ingest** | `bun run docker:ingest` | `local-redis` (durable), `mosquitto`, `frigate`, `depot×N` (опц. GPU), `forwarder` | ingest-узел |
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
  frigate/    NVR-адаптер: Frigate Source + MediaProvider + Catalog (на @spotter/sink)
  test/       Синтетический адаптер: REPL + локальные фикстуры (офлайн-разработка)
  bot/        Telegram-бот (grammY)
  depot/      Медиа-процессор (ffmpeg/sharp; S3 по ключу)
  forwarder/  Двунаправленный мост Redis Streams local↔remote (распределённый деплой)
packages/
  sink/        Фреймворк адаптера: Source/MediaProvider/Catalog + runSink (стейджинг в S3)
  transport/   Абстракции транспорта (RedisRegulator) + контракты (event/медиа/каталог) + helpers
  stenograph/  Логгер
apps/bot/src/db/      SQLite-схема и репозиторий (Drizzle): chats, users, events
apps/bot/drizzle/     Сгенерированные миграции Drizzle
.deployment/compose/  Compose-профили: development, production.single, production.ingest, production.cloud
.deployment/          Конфиги инфраструктуры (mosquitto, …)
.env.*.example        Шаблоны окружения по сервисам
.github/workflows/    CI: lint.yml (ветки) + release.yml (master)
.integration/         zx-скрипты релиза: conventional.mjs, imperative.mjs
.changeset/           Changesets: конфиг + pending-changeset'ы
```

## CI/CD и релизы

Два GitHub Actions workflow:

| Workflow | Триггер | Что делает |
| --- | --- | --- |
| [lint.yml](.github/workflows/lint.yml) | push в любую ветку **кроме** `master` | Biome (`biome ci`), commitlint (Conventional Commits), `bun run test` |
| [release.yml](.github/workflows/release.yml) | push в `master` | версионирование (changesets) → git-теги + GitHub Releases → сборка/пуш Docker-образов |

### Как работает релиз

Версионирование — через [changesets](https://github.com/changesets/changesets).
Релиз идёт в **два прохода** по `master`:

1. **Накопление.** В `master` лежат **changeset-файлы** (`.changeset/*.md`) — каждый
   описывает, какие пакеты и как бампнуть (`patch`/`minor`/`major`).
   `changesets/action` видит их и **открывает PR** «chore(ci): Update packages
   versions»: внутри PR выполняется `changeset version` — поднимаются версии в
   `package.json`, пишутся `CHANGELOG.md`, использованные changeset'ы удаляются.
2. **Публикация.** Когда этот PR смержен, на следующем прогоне `release.yml`
   pending-changeset'ов больше нет → запускается `publish` (`bun run publish` =
   `bunx changeset tag`): создаются **git-теги** и **GitHub Releases**
   (`createGithubReleases: true`). В npm пакеты **не** публикуются (они приватные,
   `access: restricted`) — распространение идёт Docker-образами.
3. **Образы.** Если что-то зарелизено (`published == true`),
   [imperative.mjs](.integration/imperative.mjs) собирает Docker-образ для каждого
   зарелизенного **приложения** (`apps/*`; у `packages/*` нет `Dockerfile`) и пушит
   в `ghcr.io/<owner>/<app>:latest` и `:<version>-alpine`. При бампе общего пакета
   (`transport`/`stenograph`) зависящие приложения получают `patch`-бамп
   (`updateInternalDependencies: patch`) и пересобираются автоматически.

Секреты: `GH_BYPASS_TOKEN` (PAT — пуш version-PR и тегов в обход branch protection),
`GITHUB_TOKEN` (логин в ghcr.io + создание Releases).

### Как выпустить новую версию

1. Веди работу в ветке, коммить по **Conventional Commits** (`fix:` → patch,
   `feat:` → minor, `feat!:` / `BREAKING CHANGE` → major). Иначе упадёт commitlint.
2. Добавь changeset, описывающий релиз:
   ```bash
   bunx changeset            # выбрать затронутые пакеты и тип бампа
   ```
   > Опционально changeset'ы можно сгенерировать из conventional-коммитов локально:
   > `bunx zx .integration/conventional.mjs` (в CI этот скрипт **не** запускается).
3. Закоммить `.changeset/*.md`, открой PR, проведи через `lint.yml`, смержи в `master`.
4. CI откроет PR «**Update packages versions**» — проверь бампы версий и `CHANGELOG`,
   смержи его.
5. На мерж этого PR `release.yml` проставит теги, создаст GitHub Releases и
   соберёт/запушит Docker-образы.

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
