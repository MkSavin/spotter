# AGENTS.md — `@spotter/forwarder`

Двунаправленный мост Redis Streams между **ingest-узлом** и **облачным узлом**.
Единственный компонент, держащий хрупкий межсайтовый хоп (через VPN-туннель).
Ingest-сервисы (`sink`/`depot`) работают только с локальным Redis; forwarder
зеркалит стримы наружу и обратно с durable store-and-forward. Общие конвенции —
в корневом [AGENTS.md](../../AGENTS.md).

## Запуск

```bash
cd apps/forwarder
bun start            # или bun start:watch
bun test
```
Нужен `.env.forwarder` (см. [.env.example](.env.example)): `REDIS_LOCAL_URL`,
`REDIS_REMOTE_URL` (+ общий `REDIS_*`-тюнинг). Локальный URL по умолчанию падает
на `REDIS_URL`.

## Как работает

Две независимые «трубы», каждая = один `RedisRegulator` из `@spotter/transport`:

- **UP (local → remote):** subscriber=local, producer=local (XACK/admin на источнике),
  handler публикует в remote. Стримы — `UP_STREAMS` ([streams.ts](src/streams.ts)):
  `spotter.event`, `spotter.event.media_processed`, `spotter.camera.frame_processed`.
- **DOWN (remote → local):** subscriber=remote, handler публикует в local. Стримы —
  `DOWN_STREAMS`: `spotter.event.media_requested`, `spotter.camera.frame_requested`,
  `spotter.event.test_seed`.

Обработчик ([forward.ts](src/forward.ts)) — passthrough: берёт сырой `value` и
делает `XADD` в одноимённый стрим на другой стороне **без перекодирования**.
`RedisRegulator` делает `XACK` только после успеха → at-least-once: при обрыве
канала записи копятся в группе на стороне-источнике (durable AOF) и досылаются
после восстановления.

## Особенности

- forwarder **stateless**: ни БД, ни S3, ни парсинга — только зеркалирование.
- Направление стрима определяется тем, **где он производится** (см. [streams.ts](src/streams.ts)) —
  это единственный источник правды; добавление нового стрима = одна строка в нужный список.
- Новый канал/поток между узлами — правка `UP_STREAMS`/`DOWN_STREAMS`, не кода трубы.
