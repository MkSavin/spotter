# AGENTS.md — `@spotter/pwa`

Основной фронтенд доставки: **PWA + тонкий Bun-сервер** в одном процессе. Консьюмит
`spotter.delivery.event` и шлёт **Web Push** (VAPID) на подписанные устройства, а также
раздаёт саму веб-аппу (Vite + React 19 + shadcn/ui + Tailwind v4). Ставится «на экран
Домой» на iPhone/Android/desktop — один код на все платформы, без App Store. Домен не
трогает напрямую: доменные мутации идут через `CommandBus` (`spotter.command.request`), как в
telegram. План и
обоснование — [.agents/plans/pwa-frontend.md](../../.agents/plans/pwa-frontend.md). Общие
конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/pwa
bun run web:build      # собрать веб-клиент в web/dist (сервер раздаёт как статику)
bun start              # или bun start:watch (Bun-сервер + API + RedisRegulator + web-push)
bun run web:dev        # Vite dev-сервер (проксирует /api на localhost:3000)
bun test               # тесты серверной части (src/)
```

Окружение: единый `.env` узла (секция `pwa` в [.env.example](../../.env.example) /
[.env.cloud.example](../../.env.cloud.example)). Сервис читает `REDIS_URL`, `S3_*`, `TZ`,
`VAPID_*`, `PORT`, `PUBLIC_URL`, `PWA_COALESCE_MS`, `S3_PRESIGN_EXPIRY`;
consumer-группа (`spotter-pwa`), `DATABASE_PATH`, `SOURCE_ID` — с дефолтами в коде.
`requireConfig` валидирует на старте (fail-fast).
**VAPID-пару генерирует сам деплойер** (`bunx web-push generate-vapid-keys`); публичный
ключ отдаётся клиенту рантайм-эндпойнтом `GET /api/vapid` — один билд PWA работает у
любого деплойера без пересборки. Сервис **полностью опционален** и требует **HTTPS**
(service worker + Web Push работают только по TLS) — ставь за reverse-proxy с сертификатом.

## Структура

```
apps/pwa/
  src/                       # тонкий Bun-сервер (Bun-only, как telegram/email)
    index.ts                 # сборка контекста + Bun.serve + RedisRegulator
    config.ts  context.ts  log.ts
    server/                  # createServer (routes-объект) + handlers/ + static.ts
    push/                    # PushGateway (web-push), dispatch (фан-аут+чистка), Coalescer
    transport/               # RedisRegulator: delivery.event + catalog.updated
    render/                  # payload нотификации + форма feed-записи
    db/                      # SQLite/drizzle: push_subscriptions, notified_events, recent_events
  web/                       # Vite + React 19 + shadcn/ui + Tailwind v4 → web/dist
    src/{sw.ts, lib, hooks, components/ui, components, pages, styles}
```

## Точка входа

[src/index.ts](src/index.ts) (`main`): поднимает SQLite, `S3Client` (presign),
`CatalogCache`, `PushGateway` (`setVapidDetails` на старте), `PushCoalescer`; два
Redis-подключения (`subscriber`, `producer`); бутстрапит каталог; **параллельно** запускает
`Bun.serve` (HTTP) и `RedisRegulator` (группа `spotter-pwa`,
[src/transport/pwaTransport.ts](src/transport/pwaTransport.ts)):

- `spotter.delivery.event` → `deliveryEventController` → `pushEventAction`
- `spotter.catalog.updated` → `catalogController` (общий, из `@spotter/transport` — как и `CatalogCache`)

## Поток доставки

```
spotter.delivery.event ──▶ deliveryEventController ──▶ pushEventAction
   всегда: обновить recent_events (лента дорисуется в открытой PWA)
   action create → claim dedup → renderEventNotification → Coalescer → dispatch (web-push)
   action update|media → только кэш, без нового пуша
```

- [pushEventAction.ts](src/transport/actions/pushEventAction.ts): пуш **только на `create`**.
  `update`/`media` молча обновляют `recent_events` (карточка перерисуется, устройство не
  «бузжит» повторно).
- **Дедуп/идемпотентность:** таблица `notified_events (event_id PK)`, атомарный `claim`
  (`INSERT … ON CONFLICT DO NOTHING … RETURNING`) — **тот же паттерн, что в
  [`apps/email`](../email/src/db/repository.ts)**. reclaim/передоставка стрима не задваивает
  пуш. При ошибке отправки claim откатывается (`release`) — регулятор переотправит.
- **Коалесинг шторма** ([Coalescer.ts](src/push/Coalescer.ts)): первое событие камеры — пуш
  сразу; последующие за окном `PWA_COALESCE_MS` схлопываются в один «N событий · камера».
- **Двойная защита от дублей нотификаций:** серверный `topic` (web-push, ≤32 симв., =
  `eventCode`) заменяет непоказанный пуш на push-сервисе; клиентский `tag = eventId` в SW —
  на устройстве.
- **Адресация — channel-local:** `DeliveryEvent` recipients не несёт; PWA держит свою
  таблицу `push_subscriptions` и шлёт всем активным.

## REST API (`src/server/`)

`GET /api/health` · `GET /api/vapid` (публичный ключ) · `GET /api/subscription?endpoint=` ·
`POST /api/subscribe` · `POST /api/unsubscribe` · `POST /api/test-push` · `POST /api/auth`
(одноразовый код) · `GET /api/events` (лента, presign медиа) · `GET /api/events/:id`. Тела
валидируются zod. Всё, что не `/api/*`, отдаётся из `web/dist` c SPA-fallback (deep-link
`/event/:id` работает при полной загрузке).

## PWA / Web Push (`web/`)

- **Service worker** [web/src/sw.ts](web/src/sw.ts) (`injectManifest`, без precache —
  приложение онлайновое): `push` → `showNotification`; `notificationclick` → фокус/открытие
  `/event/:id`; на каждый пуш шлёт `postMessage` открытым вкладкам, чтобы лента обновилась.
- **Подписка** ([web/src/lib/push.ts](web/src/lib/push.ts)): разрешение запрашивается
  **строго из клик-хендлера** (требование iOS); iOS также требует «на экран Домой».
  Сетап-экран ведёт пользователя тремя шагами (установка → разрешение → код).
- **Мёртвые подписки** (404/410 от push-сервиса) удаляются при фан-ауте (`dispatch`).

## БД (`src/db/`, drizzle/sqlite)

- `push_subscriptions (endpoint UNIQUE, p256dh, auth, device_label?, recipient_uuid?)` —
  подписки устройств; `recipient_uuid` проставляется после ввода кода.
- `notified_events (event_id PK)` — дедуп передоставки (как в email).
- `recent_events (event_id PK, payload JSON)` — кольцевой кэш последних N событий для ленты
  (истина — в `server`; это только чтобы лента не была пустой до первого пуша).

После правок `schema.ts` — `bunx drizzle-kit generate` (миграции в `apps/pwa/drizzle/`,
применяются на старте).

## Авторизация устройства

Код проверяет **домен**, не PWA: `device.redeem` берёт из того же пула `access_tokens`, что
`/user_sign` выдаёт для бота — доступ выдаётся один раз, а не по разу на фронтенд. В ответ
приходит настоящая роль (`VIEWER`/`USER`/`ADMIN`), её же сервер и проверяет на каждой команде.

Устройство живёт в таблице `devices`, **отдельно от `push_subscriptions`**: авторизация — это
погашенный код, а не разрешённые уведомления, и браузер меняет push-endpoint без участия
пользователя. Клиент хранит `deviceId` (переживает переавторизацию) и bearer-токен; на 401
токен сбрасывается и приложение снова показывает экран кода.

Гейт в `server/auth.ts` — удобство, а не граница безопасности: команда несёт `recipientUuid`,
и роль перепроверяет сервер. Понижение роли доезжает через `spotter.delivery.recipient`
([recipientController](src/transport/controllers/recipientController.ts)) — иначе UI до
переавторизации предлагал бы кнопки, которые всё равно отобьются.

Роли не продублированы: словарь (`ROLES`, `ROLE_RANK`, `satisfies`) живёт в
`@spotter/transport`.

## HTTP API

`/api/health`, `/api/vapid` открыты; **всё остальное требует bearer-токен**. Лента тоже: она
несёт снимки из дома, и открытый эндпойнт отдавал бы их любому, кто знает URL.

| Маршрут | Роль | Что делает |
|---|---|---|
| `POST /api/auth` | — | гасит код через `device.redeem`, возвращает токен и роль |
| `GET /api/events`, `/api/events/:id` | authorized | лента и карточка события |
| `GET /api/cameras` | authorized | каталог камер |
| `GET /api/status` | authorized | heartbeat'ы сервисов |
| `POST /api/snapshot` | USER | кадр с камеры |
| `POST /api/clip` | USER | запрос видео события |

Снимок и клип **не возвращают медиа в ответе**: запрос уходит в конвейер, а результат
приходит пушем, как обычное событие. Кнопка подтверждает приём запроса, не ждёт файл.

## Версии и отклонения

Новейшие стабильные (React 19.2, Vite 8.1, Tailwind v4.3, vite-plugin-pwa 1.3, web-push 3.6,
sonner 2.0). Осознанные отклонения: `drizzle-orm`/`drizzle-kit` — **как в остальном
монорепо** (единая версия ORM важнее свежести); `bun:sqlite` (Bun-only). Vite запускается
`bun --bun vite` (Vite 8/rolldown требует нового Node; в проекте — только Bun).

## Особенности

- `applicationLogger = defaultLogger.sub('pwa')`.
- Может жить на отдельном веб-хосте и ходить в главный Redis по IP — как отдельный инстанс.
- Человекочитаемый рендер события (лейблы/тайминг) — из общего `@spotter/transport`
  (`renderEvent`), тот же, что теперь у email; Telegram оставляет свой HTML-рендер.
- В `production.cloud.yml` сервис под compose-профилем `pwa` (opt-in): поднимается флагом
  `./spotter up --pwa`, нужна секция `pwa` в `.env` (VAPID генерит `install.ts` или
  `bunx web-push generate-vapid-keys`) и TLS-прокси.
