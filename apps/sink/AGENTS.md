# AGENTS.md — `@spotter/sink`

Мост NVR → Redis Streams. Подключаемый **источник** (`Source`) ингестит события NVR, нормализует
их в `SpotterEvent` и публикует в стрим `spotter.event`. Точка входа потока данных всей системы.
Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/sink
bun start            # или bun start:watch
bun test
```
Нужен `.env.sink` (см. `.env.sink.example`): `REDIS_URL`, `SOURCE_TYPE` (по умолч. `frigate`),
`MQTT_BROKER` (для frigate-источника).

## Точка входа

[src/index.ts](src/index.ts): подключает Redis (`subscriber` + `producer`/`StreamProducer`),
строит источник через `constructSource(config.source.type, ...)` и запускает его, передавая
`emit`-колбэк, который публикует событие через `publishEvent`. Параллельно — `RedisRegulator`
на `spotter.event.test_seed` → `eventTestController` (ручной посев тестовых событий командой
`/test_publish` в боте). Источник и регулятор останавливаются в shutdown-хендлере.

## Source — подключаемый источник (mirror `NvrEndpoint` бота)

[src/source/](src/source/): абстракция `Source` ([Source.ts](src/source/Source.ts)) + реализации
+ реестр `constructSource` ([constructSource.ts](src/source/constructSource.ts)) — точная калька
паттерна `NvrEndpoint`/`constructEndpoint` из бота.

```ts
const source = constructSource(config.source.type, config, logger)
const handle = await source.run(async (event) => { await publishEvent(event, producer) })
// handle.stop() в shutdown
```

- `Source` владеет своим **входным транспортом** и **парсингом** raw → `SpotterEvent`, отдаёт
  события в `emit`-колбэк. **Не** трогает Redis — публикацию делает рантайм. Stateless.
- `FrigateSource` ([FrigateSource.ts](src/source/FrigateSource.ts)) — MQTT (`frigate/events`)
  через `MqttRegulator` + `parseFrigateEvent`. Владеет собственным MQTT-подключением.
- **Один sink = один источник = один NVR.** Новый NVR — новый класс `Source` + запись в реестре
  `constructSource`; формат на выходе всегда `SpotterEvent`. Неизвестный код → fallback на frigate.

### MqttRegulator
Транспортный примитив MQTT, который использует `FrigateSource`
([src/regulators/MqttRegulator.ts](src/regulators/MqttRegulator.ts)): `.on(topic, handler).run({ mqtt })` —
ждёт коннекта, подписывается, раздаёт сообщения подписчикам. Для не-MQTT NVR источник реализует
свой транспорт (HTTP/webhook/poll), `MqttRegulator` ему не нужен.

## Парсинг событий Frigate

[src/parsing/parseFrigateEvent.ts](src/parsing/parseFrigateEvent.ts) превращает сырой payload
Frigate в нормализованный `SpotterEvent` (используется `FrigateSource`):

- берёт `contents.after`, требует `id` / `camera` / `label` — иначе `throw` (источник ловит и пропускает);
- нормализует `type`: `new`/`start` → `start`;
- **фильтрует баговые события** Frigate: `position_changes === 0` → `throw`
  (см. [обсуждение](https://github.com/blakeblackshear/frigate/discussions/9974));
- на выходе валидирует объект через `parseSpotterEvent` (zod-схема из `@spotter/transport`) —
  источник не может выпустить в поток событие, не соответствующее контракту.

> Не убирай эти проверки — Frigate регулярно шлёт неполные/ложные события.

## Контракт `SpotterEvent`

`SpotterEvent` — **zod-схема** `spotterEventSchema` в [@spotter/transport](../../packages/transport/src/schema/spotterEvent.ts),
а не просто TS-тип. Это публичный контракт между сервисами: любой кастомный sink (на любом языке)
обязан класть в `spotter.event` валидный `SpotterEvent`. Хелперы: `parseSpotterEvent` (throws,
для продюсера), `safeParseSpotterEvent` (→ `null`, для консьюмера). При расширении модели событий
правь **только** схему в transport — тип инферится из неё.

## Публикация

[src/helpers/publishEvent.ts](src/helpers/publishEvent.ts) (`publishEvent`) шлёт `SpotterEvent`
в стрим `spotter.event` через `producer.publish` (`XADD`). Стрим — единый упорядоченный лог,
так что порядок апдейтов одного события сохраняется без ключа партиции.

## Особенности

- sink **stateless**: ни БД, ни S3 — только вход источника и Redis-выход.
- Любой невалидный/подозрительный payload → ранний `return`/`throw` + лог `warn`, а не падение.
- Расширение на другие NVR = новый класс `Source` + запись в `constructSource`; формат на выходе всегда `SpotterEvent`.
