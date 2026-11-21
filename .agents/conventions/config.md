# Конфигурация

Каждый сервис собирает настройки в `src/config.ts` функцией `resolveConfig`:

```ts
import { env, requireConfig, resolveRedisConfig } from '@spotter/transport'

const redis = resolveRedisConfig({ group: 'spotter-server', clientId: 'spotter-server' })
env.number('REDIS_BLOCK_MS', 5000)
env.boolean('FLAG', false)
requireConfig({ REDIS_URL: redis.url, S3_HOST: s3.host, S3_SECRET: s3.secretKey })
```

`requireConfig` сообщает все отсутствующие обязательные значения сразу. Не читай `process.env` в бизнес-логике.

Один `.env` на узел загружается и при `bun start`, и в compose; сервис игнорирует чужие переменные. Сетевые адреса и `REDIS_CLIENT_ID` compose переопределяет через `environment`.

`REDIS_GROUP_ID`, `DATABASE_PATH` и `SOURCE_ID` имеют дефолты в коде. Не выноси общий `REDIS_GROUP_ID` в `.env`: он перезапишет группы всех сервисов. Общий `DATABASE_PATH` столкнёт несколько сервисов в один SQLite-файл.

Шаблоны: `.env.example` для single/dev, `.env.cloud.example` и `.env.ingest.example` для распределённых узлов. NVR-креды `FRIGATE_*` находятся только на ingest. `forwarder` использует `REDIS_LOCAL_URL` и `REDIS_REMOTE_URL`, не `REDIS_URL`.

Первый запуск выполняет `.integration/install.ts`. Продом управляет `./spotter`; список команд находится в `.integration/cli.ts`.

`DIRECTORY_CLEANUP` управляет temp-файлами depot, `S3_PRESIGN_EXPIRY` — сроком ссылок. Настройки Appercot описаны в [../appercot.md](../appercot.md).
