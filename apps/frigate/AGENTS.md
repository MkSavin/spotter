# AGENTS.md — `@spotter/frigate`

NVR-адаптер для Frigate на фреймворке [`@spotter/sink`](../../packages/sink). Единственный
компонент, знающий специфику Frigate (URL-схемы, JWT, `/api/config`) и держащий его креды.
Ингестит события в `spotter.event`, стейджит медиа в S3 по запросу и публикует каталог.
Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/frigate
bun start            # или bun start:watch
bun test
```
Окружение: единый `.env` узла (см. [.env.example](../../.env.example) для single,
[.env.ingest.example](../../.env.ingest.example) для ingest). Сервис читает `REDIS_URL`,
`S3_*` (стейджинг сырья), `TZ`, `S3_STAGING_PREFIX`, `FRIGATE_REMOTE_URL` /
`FRIGATE_AUTH_USER` / `FRIGATE_AUTH_SECRET`, `MQTT_BROKER`; `SOURCE_TYPE` (по умолч.
`frigate`) compose задаёт inline через `environment:`; consumer-группа и `SOURCE_ID` —
с дефолтами в коде. `MQTT_BROKER` живёт в `.env`, а не в compose: брокер может быть
своим (`mqtt://mosquitto:1883`, поднимается профилем `mqtt`) или готовым — адаптеру
всё равно, но от этого зависит, стартует ли наш mosquitto. **Креды NVR (`FRIGATE_*`) живут ТОЛЬКО на узле с камерами** — в
cloud-`.env` их выносить нельзя.

## Точка входа

[src/index.ts](src/index.ts) собирает три пуглируемых порта `@spotter/sink` и передаёт их в `runSink`:

```ts
const source = constructSource(config.source.type, config, applicationLogger)
const mediaProvider = new FrigateMediaProvider(config.frigate)
const catalog = new FrigateCatalog(config, applicationLogger)
runSink({ config, logger, information, sourceId: config.sourceId, source, mediaProvider, catalog, controllers })
```

`runSink` ([packages/sink](../../packages/sink)) поднимает Redis (+ S3), запускает ingest источника
(штампует `source` и публикует в `spotter.event`), регистрирует консьюмеры медиа/кадров
(`spotter.{media,camera}.request.<source>`) при наличии `mediaProvider` и публикует каталог.

## Source — ингест событий

[src/source/](src/source/): `FrigateSource` (`extends Source` из `@spotter/sink`) слушает MQTT
(`frigate/events`) через `MqttRegulator`, парсит `parseFrigateEvent` → `SpotterEvent`, отдаёт в
`emit`. Реестр — `constructSource` ([constructSource.ts](src/source/constructSource.ts)); неизвестный
код → fallback на frigate. Источник владеет своим транспортом, **не** трогает Redis (это делает рантайм).

### Парсинг событий Frigate
[src/parsing/parseFrigateEvent.ts](src/parsing/parseFrigateEvent.ts): берёт `contents.after`, требует
`id`/`camera`/`label` (иначе `throw`), нормализует `type` (`new`/`start` → `start`), **фильтрует
баговые** события (`position_changes === 0` → `throw`,
[обсуждение](https://github.com/blakeblackshear/frigate/discussions/9974)), на выходе валидирует
`parseSpotterEvent`. Не убирай эти проверки — Frigate регулярно шлёт неполные события.

## MediaProvider — доступ к медиа (держатель кредов)

[src/media/FrigateMediaProvider.ts](src/media/FrigateMediaProvider.ts) реализует порт `MediaProvider`:
`resolveClip`/`resolveSnapshot`/`resolveFrame` строят `Request` к Frigate (URL-схема +
`Authorization: Bearer <JWT>`). JWT минтит [frigateClient.ts](src/frigate/frigateClient.ts)
(HS256, `FRIGATE_AUTH_*`). **Только здесь** живут креды NVR; рантайм фетчит этот `Request` и
стейджит байты в S3 — по сети уходит лишь ключ S3.

## Catalog — таксономия

[src/catalog/FrigateCatalog.ts](src/catalog/FrigateCatalog.ts) реализует порт `Catalog`: тянет
камеры и tracked-объекты из Frigate `/api/config` (мемоизированно), лейблы берёт из
`config.labels` (фолбэк — на коды). При недоступности Frigate откатывается на коды из конфига.
Рантайм публикует снимок в ключ `spotter.catalog.<source>` + стрим `spotter.catalog.updated`.

## Контракт `SpotterEvent`

`SpotterEvent` — **zod-схема** в [@spotter/transport](../../packages/transport/src/schema/spotterEvent.ts),
публичный контракт. Любой кастомный адаптер (на любом языке) обязан класть в `spotter.event`
валидный `SpotterEvent`. При расширении модели правь **только** схему в transport.

## Особенности

- Адаптер — единственный держатель кредов Frigate; вниз по потоку (`bot`/`depot`) их быть не должно.
- Любой невалидный payload → ранний `return`/`throw` + лог `warn`, а не падение.
- Новый NVR = новый адаптер-приложение на `@spotter/sink` (свои `Source`/`MediaProvider`/`Catalog`),
  а не правка этого. Для офлайн-разработки см. [apps/test](../test).
