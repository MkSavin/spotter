# Развёртывание Spotter

Пошаговая инструкция для трёх режимов: **разработка**, **единый узел** и
**распределённо** (ingest + cloud). Написано для тех, кто впервые видит проект.

## Как вообще всё устроено (в двух словах)

- Сервисы **не** вызывают друг друга напрямую — общаются через **Redis Streams**.
  Поэтому «развернуть» = поднять Redis + нужные контейнеры, которые в него пишут/читают.
- Каждый сервис читает **два** env-файла: общий `.env` (Redis, S3, TZ — один на хост)
  и тонкий `.env.<сервис>` поверх (креды/настройки конкретного сервиса).
- Docker-образы уже собраны в CI и лежат в `ghcr.io/mksavin/spotter-*`. На хосте их
  не собирают — только **скачивают и запускают**.
- **Все compose-команды запускаются из корня репозитория** — пути к `.docker/` и
  `.deployment/` относительные.

Топологии подробно (со схемами) — в [README](../README.md#архитектура).

---

## Подготовка (одна на любой режим)

1. Установить **Docker** и **Docker Compose** (входит в Docker Desktop / `docker compose`).
2. Склонировать репозиторий и зайти в его корень:
   ```bash
   git clone https://github.com/mksavin/elercam.git spotter
   cd spotter
   ```
3. Создать общий `.env` из примера и вписать реальные значения (Redis подставит compose,
   а **S3 обязателен** — любой S3-совместимый бэкенд):
   ```bash
   cp .env.example .env
   ```
4. Для каждого поднимаемого сервиса создать его тонкий env-файл:
   ```bash
   cp .env.frigate.example  .env.frigate     # креды NVR (только на ingest/single)
   cp .env.server.example   .env.server
   cp .env.telegram.example .env.telegram    # токен бота
   cp .env.depot.example    .env.depot
   # опциональные фронтенды:
   cp .env.pwa.example      .env.pwa
   cp .env.email.example    .env.email
   ```
   Что заполнять — в комментариях внутри каждого файла и в `AGENTS.md` сервиса.

---

## Режим 1. Разработка (одна машина)

Инфраструктура — в Docker, сами сервисы — на хосте через Bun (быстрый рестарт, HMR).

```bash
bun install                 # зависимости
bun run docker:dev          # поднять redis + mosquitto
bun run sign:token admin    # (один раз) выпустить код доступа для авторизации
cd apps/server && bun start:watch    # домен
cd apps/telegram && bun start:watch  # Telegram-фронтенд
# фронтенд-разработка PWA: в apps/pwa два процесса —
#   bun start:watch   (сервер: API + Redis + web-push, порт 3000)
#   bun run web:dev    (Vite dev-сервер с HMR, проксирует /api → :3000)
```

Остановить инфру: `docker compose --project-directory . -f .deployment/compose/development.yml down`.

---

## Режим 2. Единый узел (простой прод)

Одна машина ингестит с NVR **и** ходит в Telegram. Единый Redis, `forwarder` не нужен.

```bash
cp .env.example .env                       # + заполнить
cp .env.frigate.example .env.frigate       # + креды NVR
cp .env.server.example .env.server
cp .env.telegram.example .env.telegram     # + токен бота
cp .env.depot.example .env.depot

docker compose --project-directory . -f .deployment/compose/production.single.yml pull
bun run docker:single                      # = docker compose ... up -d
```

Поднимутся: `redis`, `mosquitto`, `frigate`, `depot`, `server`, `telegram`.

Проверка:
```bash
docker compose --project-directory . -f .deployment/compose/production.single.yml ps
docker compose --project-directory . -f .deployment/compose/production.single.yml logs -f spotter-server
```

Выпустить код доступа для оператора (внутри контейнера server):
```bash
docker exec spotter-server bun apps/server/src/cli.ts sign admin
```

---

## Режим 3. Распределённо (ingest + cloud)

**Две машины.** Между ними — VPN-туннель (site-to-site; для ограниченных сетей —
XRAY-VLESS / AmneziaWG 2). Внутри туннеля у cloud-узла адрес вида `10.0.0.1`.

- **ingest-узел** (рядом с камерами): буферизует и транскодит. `forwarder` зеркалит
  стримы в облако и обратно, а при обрыве канала копит всё в `local-redis` (appendonly),
  чтобы ничего не потерять.
- **cloud-узел** (VPS): главный Redis, домен `server` и фронтенды (Telegram + опц. PWA).

### 3.1. На cloud-узле

```bash
cp .env.example .env                       # REDIS_URL здесь — локальный redis узла
cp .env.server.example .env.server
cp .env.telegram.example .env.telegram

docker compose --project-directory . -f .deployment/compose/production.cloud.yml pull
bun run docker:cloud
```
Поднимутся `redis` (главный durable-буфер) + `server` + `telegram`.

> **Redis наружу не публикуй.** В `production.cloud.yml` порт `6379` открыт для примера —
> в бою привяжи его к интерфейсу туннеля (`10.0.0.1:6379:6379`), а не к `0.0.0.0`.

### 3.2. На ingest-узле

```bash
cp .env.example .env
cp .env.frigate.example .env.frigate       # + креды NVR (живут ТОЛЬКО тут)
cp .env.depot.example .env.depot
cp .env.forwarder.example .env.forwarder

# указать адрес облачного Redis внутри туннеля:
#   REDIS_REMOTE_URL=redis://10.0.0.1:6379  (в production.ingest.yml / .env.forwarder)

docker compose --project-directory . -f .deployment/compose/production.ingest.yml pull
bun run docker:ingest
```
Поднимутся `local-redis` (durable), `mosquitto`, `frigate`, `depot×2` (опц. GPU), `forwarder`.

### 3.3. Опциональный PWA-фронтенд (на cloud-узле)

PWA в `production.cloud.yml` **закомментирован** (opt-in). Чтобы включить:

1. Сгенерировать свою VAPID-пару и вписать в `.env.pwa`:
   ```bash
   bunx web-push generate-vapid-keys
   ```
2. Раскомментировать блок `spotter-pwa` в `production.cloud.yml`.
3. Поставить **за TLS-прокси** (Caddy/nginx) — Web Push и service worker работают
   только по HTTPS. `bun run docker:cloud` подхватит сервис.

---

## Автоматический деплой новых версий

Важно понимать границу: **CI собирает образы, но НЕ раскатывает их на узлы.**

```
push в master → release.yml → версии (changesets) → git-теги/Releases
                            → сборка и пуш образов в ghcr.io/mksavin/spotter-*:latest
                            └── на этом CI заканчивается ─┐
                                                          ▼
                      узлы продолжают крутить СТАРЫЙ образ, пока их не обновишь
```

Детали релиз-процесса (changesets, теги) — в [README](../README.md#cicd-и-релизы).

### Обновить узел вручную

На каждом узле, из корня репозитория, для его профиля:
```bash
# пример для cloud-узла:
docker compose --project-directory . -f .deployment/compose/production.cloud.yml pull
docker compose --project-directory . -f .deployment/compose/production.cloud.yml up -d
docker image prune -f      # убрать старые слои
```
`pull` тянет свежий `:latest`, `up -d` пересоздаёт только изменившиеся контейнеры
(остальные не трогает). БД/подписки переживают пересоздание — они в volume `.docker/*`.

### Сделать это автоматическим

Чтобы узлы сами подхватывали новый `:latest`, добавь на каждый узел
[**Watchtower**](https://containrrr.dev/watchtower/) — он периодически проверяет реестр
и пере-раскатывает обновлённые контейнеры:
```bash
docker run -d --name watchtower --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower --cleanup --interval 300
```
После этого цикл сквозной: **смержил релиз → CI собрал образ → Watchtower выкатил его
на узлы**. Для распределёнки Watchtower ставится и на ingest, и на cloud — каждый
обновляет свои сервисы независимо.

> Компромисс: Watchtower тянет `:latest` без ручного подтверждения. Если нужен контроль
> «когда именно», оставляй ручной `pull && up -d` или пинь конкретную версию образа
> (`:1.4.0-alpine` вместо `:latest`) и меняй её осознанно.

---

## Шпаргалка

| Действие | Команда |
| --- | --- |
| dev-инфра | `bun run docker:dev` |
| единый узел | `bun run docker:single` |
| ingest-узел | `bun run docker:ingest` |
| cloud-узел | `bun run docker:cloud` |
| статус | `docker compose --project-directory . -f <профиль> ps` |
| логи | `docker compose --project-directory . -f <профиль> logs -f <сервис>` |
| обновить узел | `... pull && ... up -d` |
| остановить | `docker compose --project-directory . -f <профиль> down` |

`<профиль>` = один из `.deployment/compose/*.yml`.
