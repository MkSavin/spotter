# AGENTS.md — `@spotter/email`

Email-фронтенд доставки (**опциональный, добавочный**). Консьюмит абстрактные delivery-события
от server и шлёт по одному письму-оповещению на событие через SMTP. Домен не трогает и наружу
ничего не мутирует — это тонкий односторонний консьюмер. Роль в проекте: **не** основной
фронтенд (это PWA) и **не** аварийная гарантия (это SMS), а дешёвая добавка — почта доступна
везде без установки и у российского провайдера whitelisted-устойчива при шатдаунах. План и
обоснование — [.agents/plans/email-channel.md](../../.agents/plans/email-channel.md). Общие
конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/email
bun start            # или bun start:watch
bun test
```
Окружение слоёное: общий `.env` (`REDIS_URL`, `S3_*`, `TZ`) + тонкий `.env.email`
(см. [.env.email.example](../../.env.email.example)) поверх: `REDIS_GROUP_ID` (`spotter-email`),
`SMTP_*`, `EMAIL_RECIPIENTS`, `EMAIL_MODE`, `DATABASE_PATH`, `SOURCE_ID`, `S3_PRESIGN_EXPIRY`,
`PUBLIC_URL`. `requireConfig` валидирует на старте; `SmtpGateway.verify()` дополнительно
проверяет коннект/креды SMTP до входа в цикл (fail-fast). NVR-кредов нет — S3 только для
presign байтов кадра. Сервис **полностью опционален**: не поднимаешь — ничего не ломается.

## Точка входа

[src/index.ts](src/index.ts) (`main`): headless (без бота/HTTP). Поднимает SQLite (dedup-леджер),
`S3Client` (presign), `CatalogCache`, `SmtpGateway`; два Redis-подключения (`subscriber`,
`producer`); бутстрапит каталог из `spotter.catalog.<source>`; верифицирует SMTP; запускает
`RedisRegulator` (группа `spotter-email`,
[src/transport/emailTransport.ts](src/transport/emailTransport.ts)):

- `spotter.delivery.event` → `deliveryEventController`
- `spotter.catalog.updated` → `catalogController`

## Поток доставки

```
spotter.delivery.event ──▶ deliveryEventController ──▶ sendEmailAction
   action create → claim dedup → renderEmail (subject+text+html, presign кадра) → SMTP send
   action update|media → игнор (одно письмо на событие, без тредов правок)
```

- [sendEmailAction.ts](src/transport/actions/sendEmailAction.ts): письмо **только на `create`**.
  `update`/`media` молча пропускаются — почту нельзя редактировать in-place, поэтому один event =
  одно письмо (иначе спам в ящике). Кадр — presign-ссылкой на S3 (`snapshotKey`), плюс deep-link
  в веб-фронтенд (`PUBLIC_URL/event/:id`, если задан).
- **Дедуп/идемпотентность:** таблица `notified_events (event_id PK)`. `claim` атомарен
  (`INSERT … ON CONFLICT DO NOTHING … RETURNING`), поэтому reclaim/повторная доставка стрима
  никогда не задваивает письмо. При ошибке SMTP claim откатывается, запись остаётся pending —
  регулятор её переотправит (at-least-once).
- **Адресация — channel-local:** `DeliveryEvent` recipients не несёт; список ящиков — из
  `EMAIL_RECIPIENTS`. Получатели уходят в `bcc`, чтобы адреса не текли между собой.
- [renderEmail.ts](src/transport/view/renderEmail.ts): самодостаточная тема
  (`SPOTTER ⚠ камера · объект · время`) + HTML и plain-text тело. Лейблы — из `CatalogCache`
  (как в telegram), NVR-знания нет. HTML-инъекции экранируются.

## Дедуп/триггер (общая политика)

Тот же межканальный принцип, что у PWA/SMS (см.
[обзор](../../.agents/plans/emergency-channels-overview.md)): письмо один раз на событие. Флаг
`EMAIL_MODE`:

- `always` — письмо параллельно другим каналам (дефолт);
- `fallback` — зарезервировано под **межканальный ACK-триггер** (слать только если основной
  канал не подтвердил доставку). **Сам триггер ещё не построен** — пока `fallback` ведёт себя
  как `always`. Значение читается и логируется, чтобы включить механизм позже без смены API.

## БД (`src/db/`, drizzle/sqlite)

`notified_events (event_id PK, notified_at)` — леджер уже отправленных писем (идемпотентность).
После правок `schema.ts` — `bunx drizzle-kit generate` (миграции в `apps/email/drizzle/`,
применяются на старте).

## Доставляемость (SPF/DKIM) — кратко

По умолчанию — **путь A**: ящик рос-провайдера (Yandex/Mail.ru), у него SPF/DKIM настроены
провайдером, со стороны проекта DNS трогать не нужно; домен провайдера whitelisted при
шатдаунах. Путь B (свой домен + SPF/DKIM/DMARC в DNS) — для сторонних деплойеров, кому нужен
свой домен-отправитель. Подробное объяснение SPF/DKIM — в
[PWA-плане](../../.agents/plans/pwa-frontend.md).

## Особенности

- `applicationLogger = defaultLogger.sub('email')`.
- Может жить на отдельном веб-хосте и ходить в главный Redis по IP (как отдельный инстанс), а не
  обязательно рядом с server/redis.
- В `production.cloud.yml` сервис добавлен **закомментированным** (opt-in): раскомментировать +
  завести `.env.email`.
