# AGENTS.md — `@spotter/bot`

Telegram-фронтенд (grammY). Реагирует на Kafka-события камер, шлёт уведомления и
обрабатывает команды операторов. Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/bot
bun start            # или bun start:watch
bun test
```
Нужен `.env.bot` в корне (см. `.env.bot.example`): `TELEGRAM_TOKEN`, `KAFKA_BROKERS`,
`FRIGATE_REMOTE_URL`, `MEDIA_STRATEGY`. БД — SQLite-файл `DATABASE_PATH` (по умолчанию
`./data/bot.sqlite`), миграции применяются автоматически при старте.

## Точка входа

[src/index.ts](src/index.ts): `initialize()` собирает `Bot`, навешивает middleware
(logging → core-context → sequentialize → hydrate → commands → session), затем
`polling()` поднимает Kafka и вызывает `eventTransport()`.

Порядок важен: транспорт стартует **после** того как раннер бота поднялся
(`await timeout(500)`), иначе сообщения могут потеряться.

## Команды

Структура `src/commands/<домен>/<name>Command.ts`, домены: `general`, `auth`, `nvr`,
`admin`, `user`, `test`. Регистрация и группировка по ролям — в
[src/commands/commandList.ts](src/commands/commandList.ts).

Команда строится так:

```ts
export const cameraListCommand = new Command<BotContext>('camera_list', 'Описание')
  .addToScope(commandScopes.private, [
    guard(Role.ADMIN),     // проверка роли из сессии
    sender('present'),     // подготовка отправителя
    async (context, next) => { /* ... */ ; return next() },
  ])
```

Видимость команд переключается по роли пользователя через middleware
[switchCommandList](src/middlewares/bot/switchCommandList.ts).

### Middleware команд (`src/middlewares/command/`)
- `guard(role | 'authorized' | 'anonymous')` — отсекает по роли (`USER`/`ADMIN`), берёт роль из `context.session.user.authorizedRole`.
- `sender(...)` — подготовка контекста отправки.
- `argument(...)` — разбор аргументов команды.

## Авторизация и сессии

[src/session.ts](src/session.ts): multi-session (`user` + `global`).
- `user.authorizedRole` — роль, кешируется из таблицы `User` при первом сообщении (см. session-middleware в `index.ts`, список юзеров грузится один раз на старте).
- `global.events` — кеш активных событий по id.

Токены — JWT, подписанные `AUTH_SECRET`. Выдать: `bun run sign:token <role>` (CLI в [src/cli.ts](src/cli.ts)).
Оператор активирует токен командой `/login`.

## Транспорт (Kafka)

[src/transport/eventTransport.ts](src/transport/eventTransport.ts) подписывается на:
- `spotter.event` → `eventController` — создаёт/обновляет событие, шлёт/актуализирует уведомление.
- `spotter.event.media_processed` → `eventMediaController` — досылает медиа к уведомлению.
- `spotter.camera.frame_processed` → `cameraFrameController` — отдаёт кадр по запросу `/camera_snapshot`.

Контроллеры → `actions/` (бизнес-логика), `view/` (рендер сообщений), `parsing/`, `helpers/`, `mixins/`.

## NVR-эндпоинты

`src/endpoint/`: абстракция `NvrEndpoint`, реализации `FrigateEndpoint` и `TestEndpoint`,
выбор через `constructEndpoint(config.nvr.type, ...)`. `NVR_TYPE=test` отключает реальные запросы.

## Innoxious — надёжная отправка медиа

`src/extension/innoxious/`. Telegram не достучится до локальных IP NVR, поэтому отправка медиа
идёт с retry и фолбэком стратегий ([InnoxiousExecutor](src/extension/innoxious/InnoxiousExecutor.ts)):

1. **naive** (2 попытки) — отдаём URL/путь напрямую (минимум трафика).
2. **accurate** (фолбэк) — скачиваем в `Buffer`, шлём как файл (гарантия доставки).

API подключается к боту через `attachInnoxious(bot.api)` и доступен как:

```ts
const media = new InnoxiousMediaGroup([{ type: 'photo', media: url }])
await bot.api.innoxious.sendMediaGroup(chatId, media)
// также: sendPhoto / sendDocument / sendVideo
```

`MEDIA_STRATEGY` (env) задаёт дефолтную стратегию формирования источника медиа.

## Особенности

- БД — SQLite + Drizzle в [src/db/](src/db/); доступ только через `repository.ts` (`usersRepo`/`chatsRepo`/`eventsRepo`). `Role` и типы — из [src/db/schema.ts](src/db/schema.ts).
- Все ответы пользователю — на русском, HTML-разметка (`replyWithHTML`, `parse-mode`).
- Список авторизованных юзеров кешируется на старте — после `/login`/`sign` новому юзеру может потребоваться переподключение сессии.
