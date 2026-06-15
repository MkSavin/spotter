# AGENTS.md — `@spotter/bot`

Telegram-фронтенд (grammY). Реагирует на события камер из Redis Streams, шлёт уведомления и
обрабатывает команды операторов. Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/bot
bun start            # или bun start:watch
bun test
```
Нужен `.env.bot` в корне (см. `.env.bot.example`): `TELEGRAM_TOKEN`, `REDIS_URL`,
`FRIGATE_REMOTE_URL`, `MEDIA_STRATEGY`. БД — SQLite-файл `DATABASE_PATH` (по умолчанию
`./data/bot.sqlite`), миграции применяются автоматически при старте.

## Точка входа

[src/index.ts](src/index.ts): `initialize()` собирает `Bot`, навешивает middleware
(logging → core-context → sequentialize → hydrate → commands → session), затем
`polling()` поднимает Redis-подключения (`subscriber` + `producer`) и вызывает `eventTransport()`.

Порядок важен: транспорт стартует **после** того как раннер бота поднялся
(`await timeout(500)`), иначе сообщения могут потеряться.

## Команды

Своя система команд (не `@grammyjs/commands` — он удалён). Команда — это **класс**,
наследник [SpotterCommand](src/commands/framework/SpotterCommand.ts). Структура файлов —
`src/commands/<домен>/<name>Command.ts`, домены: `general`, `auth`, `nvr`, `admin`, `user`, `test`.
Каркас — в [src/commands/framework/](src/commands/framework/).

```ts
class CameraListCommand extends SpotterCommand {
  readonly name = 'camera_list'
  readonly description = 'Получить список камер'
  readonly access = 'USER' as const            // 'all' | 'anonymous' | 'authorized' | Role
  protected readonly matcher = argument.string // опц. валидация аргумента
  protected readonly signature = 'camera_list [камера]'
  async handle(context) { /* ... */ }
}
export const cameraListCommand = new CameraListCommand()
```

`SpotterCommand.middlewares()` собирает цепочку `accessGuard(access) → argument? → sender? → handle`.

**Реестр** ([commandList.ts](src/commands/commandList.ts)) — единый массив `commandRegistry`
(порядок = порядок в меню). Из него [registry.ts](src/commands/framework/registry.ts):
- `registerCommands(bot, registry)` — вешает хендлеры через `bot.chatType('private').command(...)`;
- `syncCommandMenu(registry)` — на смене роли (`needUpdateCommands`) **пересоздаёт** меню на лету:
  фильтрует реестр по `isVisible(access, role)` и зовёт `ctx.api.setMyCommands(list, { scope: chat })`.

**Доступ** ([access.ts](src/commands/framework/access.ts)): `canAccess`/`isVisible` по рангам ролей
(`ROLE_RANK`: VIEWER<USER<ADMIN; anonymous = нет роли). Прав на команду больше не навешивают вручную —
всё из поля `access`. Ничего не дублируется: и регистрация, и меню берутся из одного реестра.

### Middleware команд (`src/middlewares/command/`)
- `sender('present')` — требует наличие `ctx.from`.
- `argument(matcher, signature)` — валидация аргумента, ответ-подсказка при ошибке.

## Авторизация и сессии

[src/session.ts](src/session.ts): multi-session (`user` + `global`).
- `user.authorizedRole` — роль, кешируется из таблицы `users` при первом сообщении (см. session-middleware в `index.ts`, список юзеров грузится один раз на старте).
- `global.events` — кеш активных событий по id.

Роли: `anonymous → VIEWER → USER → ADMIN`; новый пользователь всегда `VIEWER` (только нотификации).
Доступ — по одноразовым кодам в таблице `access_tokens` (не JWT). Логика — в [src/auth/](src/auth/):
`token.ts` (`generateCode`, `redeemToken`, `deepLink`), `login.ts` (общий флоу `/login` и `/start`),
`qr.ts` (PNG QR через `qrcode`). Первого админа создаёт CLI: `bun run sign:token admin`
([src/cli.ts](src/cli.ts), пишет код в БД по `DATABASE_PATH`). Внутри бота `/user_sign [@username?]`
выдаёт QR с deep-link `t.me/<bot>?start=<код>` (роль всегда `viewer`); роль меняют `/user_promote`/`/user_demote`.

> ⚠️ Смена роли/`/user_revoke` затрагивает БД, но кеш `authorizedRole` в чужой сессии живёт до
> её сброса — у затронутого пользователя изменения вступают в силу после переподключения сессии.

## Транспорт (Redis Streams)

[src/transport/eventTransport.ts](src/transport/eventTransport.ts) через `RedisRegulator`
(группа `spotter-bot`) подписывается на:
- `spotter.event` → `eventController` — создаёт/обновляет событие, шлёт/актуализирует уведомление,
  на `end` публикует `spotter.event.media_requested` через `producer.publish`.
- `spotter.event.media_processed` → `eventMediaController` — досылает медиа к уведомлению.
- `spotter.camera.frame_processed` → `cameraFrameController` — отдаёт кадр по запросу `/camera_snapshot`.

`run()` возвращает `{ stop() }` (хранится в `index.ts` для graceful shutdown). Ack — после
успешной обработки; долгая работа безопасна (см. модель доставки в корневом AGENTS.md).
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
