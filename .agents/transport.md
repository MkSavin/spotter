# Redis-транспорт

Каждый сервис читает стрим своей consumer-группой: `spotter-<service>`. Доставка — at-least-once. Контракты и имена стримов находятся в `@spotter/transport`; список — в [streams](transport/streams.md).

## Подписка

```ts
const handle = await new RedisRegulator<Context>()
  .message('spotter.media.staged', mediaStagedController)
  .run(context, { group: config.redis.group, consumer: config.redis.consumer })
```

`run()` не блокирует и возвращает `{ stop() }`; контекст содержит `subscriber`, `producer`, `logger`. Адаптер аналогично использует `MqttRegulator` с `.on('frigate/events', controller)`.

## ACK, reclaim и DLQ

`RedisRegulator` читает через `XREADGROUP` и делает `XACK` после успешной обработки. Зависшая запись остаётся в PEL; reaper забирает её через `XPENDING IDLE` и `XCLAIM`. Группа создаётся с `$`, поэтому первый запуск не пересылает старое.

Обработчик не должен держать запись дольше `REDIS_RECLAIM_MIN_IDLE_MS`: reclaim означает смерть реплики, а не длительность полезной работы. Транскодинг, экспорт и отправку больших файлов принимают, сохраняют, подтверждают и продолжают в своей очереди.

После `REDIS_MAX_DELIVERIES` неуспешных попыток запись уходит в `<stream>.dead` с `reason`, `deliveries`, `originalId` и исходным `value`; оригинал подтверждается. DLQ не подрезается автоматически, разбор — `XRANGE <stream>.dead - +`.

Durable Redis при проигрывании AOF отвечает `-LOADING`; `XGROUP CREATE` ждёт готовности до двух минут. Нельзя превращать штатный рестарт хранилища в отказ сервиса.

## Ошибки

Ретрай работает только когда обработчик бросает ошибку. Проглоченная ошибка приводит к `XACK` и потере записи. Временные сбои S3 в depot оборачиваются в `TransientError` и пробрасываются. Окончательно битое медиа логируется и завершается без ретрая.

Controller разбирает ввод, рано отбрасывает мусор и вызывает Action; ответ публикуется через `producer.publish`. Action содержит типизированную бизнес-логику. Не выполняй долгую работу внутри записи Redis.

При добавлении потока в split-топологии обнови `apps/forwarder/src/streams.ts`: иначе сообщение молча останется на одном узле.
