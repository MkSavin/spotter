# Карта сервисов

| Сервис | Назначение и документация |
| --- | --- |
| `apps/server` | Домен, события, медиаоркестрация, recipients и RPC — [AGENTS](../apps/server/AGENTS.md) |
| `apps/telegram` | Telegram-доставка, команды, медиа и локальные привязки — [AGENTS](../apps/telegram/AGENTS.md) |
| `apps/pwa` | PWA, Web Push, лента, события и настройка — [AGENTS](../apps/pwa/AGENTS.md) |
| `apps/appercot` | Бот Appercot, команды, медиа и авторизация — [гид](appercot.md) |
| `apps/email` | Одно письмо на событие и дедуп — [AGENTS](../apps/email/AGENTS.md) |
| `apps/depot` | Транскодинг из S3 по ключу — [AGENTS](../apps/depot/AGENTS.md) |
| `apps/frigate` | NVR-адаптер на `@spotter/sink` — [AGENTS](../apps/frigate/AGENTS.md) |
| `apps/forwarder` | Store-and-forward между двумя Redis |
| `apps/test` | Синтетический адаптер и REPL — [AGENTS](../apps/test/AGENTS.md) |
| `apps/probe` | Фиктивный детектор для стенда с настоящим NVR |

`packages/transport` содержит контракты, `RedisRegulator`, `RedisConnection`, `CommandBus`, каталог, heartbeat и роли. `packages/sink` содержит каркас адаптера, порты Source/MediaProvider/Catalog/TimelapseProvider и стейджинг S3. `packages/stenograph` реализует логирование.

Для текущего списка каталогов используй `ls apps` и `ls packages`; эта страница объясняет владение, а не фиксирует дерево.
