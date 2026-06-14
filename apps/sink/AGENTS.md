# AGENTS.md — `@spotter/sink`

Мост MQTT → Kafka. Слушает события Frigate в MQTT, нормализует их и публикует в Kafka.
Точка входа потока данных всей системы. Общие конвенции — в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/sink
bun start            # или bun start:watch
bun test
```
Нужен `.env.sink` (см. `.env.sink.example`): `KAFKA_BROKERS`, `MQTT_BROKER`.

## Точка входа

[src/index.ts](src/index.ts): подключает Kafka (producer/consumer) и MQTT-клиент,
регистрирует два регулятора:

- **MQTT** `frigate/events` → `frigateEventController` — основной вход событий.
- **Kafka** `spotter.event.test_seed` → `eventTestController` — ручной посев тестовых событий (команда `/test_publish` в боте).

## MqttRegulator

Свой аналог `KafkaRegulator` для MQTT ([src/regulators/MqttRegulator.ts](src/regulators/MqttRegulator.ts)):

```ts
await new MqttRegulator<Context>()
  .on('frigate/events', frigateEventController)
  .run(context)        // context должен содержать { mqtt }
```
`run()` ждёт коннекта, подписывается на топики, раздаёт сообщения подписчикам.

## Парсинг событий Frigate

[src/parsing/parseFrigateEvent.ts](src/parsing/parseFrigateEvent.ts) превращает сырой payload
Frigate в нормализованный `SpotterEvent` (тип из `@spotter/transport`):

- берёт `contents.after`, требует `id` / `camera` / `label` — иначе `throw` (контроллер ловит и пропускает);
- нормализует `type`: `new`/`start` → `start`;
- **фильтрует баговые события** Frigate: `position_changes === 0` → `throw`
  (см. [обсуждение](https://github.com/blakeblackshear/frigate/discussions/9974));
- на выходе валидирует объект через `parseSpotterEvent` (zod-схема из `@spotter/transport`) —
  адаптер не может выпустить в поток событие, не соответствующее контракту.

> Не убирай эти проверки — Frigate регулярно шлёт неполные/ложные события.

## Контракт `SpotterEvent`

`SpotterEvent` — **zod-схема** `spotterEventSchema` в [@spotter/transport](../../packages/transport/src/schema/spotterEvent.ts),
а не просто TS-тип. Это публичный контракт между сервисами: любой кастомный sink (на любом языке)
обязан класть в `spotter.event` валидный `SpotterEvent`. Хелперы: `parseSpotterEvent` (throws,
для продюсера), `safeParseSpotterEvent` (→ `null`, для консьюмера). При расширении модели событий
правь **только** схему в transport — тип инферится из неё.

## Публикация

[src/helpers/publishEvent.ts](src/helpers/publishEvent.ts) шлёт `SpotterEvent` в `spotter.event`
с ключом `event-<id>` (ключ важен — обеспечивает упорядоченность апдейтов одного события по партиции).

## Особенности

- sink **stateless**: ни БД, ни S3 — только MQTT-вход и Kafka-выход.
- Любой невалидный/подозрительный payload → ранний `return`/`throw` + лог `warn`, а не падение.
- Расширение на другие источники = новый парсер + `.on('topic', controller)`; формат на выходе всегда `SpotterEvent`.
