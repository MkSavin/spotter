# Инварианты

Эти решения нельзя менять молча: нарушение меняет архитектуру и требует согласования с владельцем. Рядом указан тест, который удерживает правило.

- **Длительность не ограничивает работу.** Транскодинг ограничен `VIDEO_TIMEOUT_MS` только против зависшего ffmpeg; S3 обрывается по тишине `S3_STALL_MS`, не по суммарному времени. [s3Transfer.test.ts](../apps/depot/src/processing/s3Transfer.test.ts).
- **Долгая работа идёт вне записи Redis.** Задание сохраняется и подтверждается до запуска; reclaim-окно означает смерть реплики. Это относится к транскодингу, экспорту и отправке клипа байтами. [TranscodeQueue.test.ts](../apps/depot/src/jobs/TranscodeQueue.test.ts), [ClipDeliveryQueue.test.ts](../apps/telegram/src/delivery/ClipDeliveryQueue.test.ts).
- **Реплика читает только под свободный слот.** Занятая реплика не копит клипы, пока свободная простаивает. [RedisRegulator.test.ts](../packages/transport/src/regulator/RedisRegulator.test.ts), [TranscodeQueue.test.ts](../apps/depot/src/jobs/TranscodeQueue.test.ts).
- **Одно событие кодируется один раз на реплике.** ID захватывается до первого `await`. [TranscodeQueue.test.ts](../apps/depot/src/jobs/TranscodeQueue.test.ts).
- **Каждый файл Telegram находится в его лимитах.** По ссылке — до 20 МБ, фото — до 5 МБ; большие файлы идут байтами до `TELEGRAM_UPLOAD_LIMIT_MB`, клип режется по `VIDEO_PART_LIMIT_MB`, непомещающийся ссылается на PWA. Размеры приходят в контракте. [InnoxiousMedia.test.ts](../apps/telegram/src/extension/innoxious/InnoxiousMedia.test.ts), [deliveryEventAction.test.ts](../apps/telegram/src/transport/actions/deliveryEventAction.test.ts).
- **Видео кодируется под экран.** Высота и FPS ограничены `VIDEO_MAX_HEIGHT` и `VIDEO_MAX_FPS`, CRF задан, ключевой кадр — каждые две секунды. [transcode.test.ts](../apps/depot/src/processing/transcode.test.ts), [splitVideo.test.ts](../apps/depot/src/processing/splitVideo.test.ts).
- **Каждое качество кодируется настоящим ffmpeg.** [transcode.test.ts](../apps/depot/src/processing/transcode.test.ts); в CI без ffmpeg проверка пропускается.
- **Пакет объявляет всё, что импортирует.** Образ ставит только объявленные зависимости. [workspaceDependencies.test.ts](../.integration/workspaceDependencies.test.ts).
- **Образ с томом `/data` отдаёт его пользователю `bun`.** [invariants.test.ts](../.integration/invariants.test.ts).
- **Каждая точка входа логирует unhandled rejection.** [invariants.test.ts](../.integration/invariants.test.ts).
- **Никакого `mock.module`.** Подмена модулей живёт в процессе и создаёт зависимость от порядка тестов; зависимости внедряются параметром. [invariants.test.ts](../.integration/invariants.test.ts).
- **NVR-креды читает только адаптер.** В server, depot и фронтендах нет `FRIGATE_*`, JWT или URL NVR. [invariants.test.ts](../.integration/invariants.test.ts).
- **Прод управляется только через `./spotter`.** Голый `docker` или `docker compose` на узле может обратиться не к той топологии; команды перечислены в [cli.ts](../.integration/cli.ts).
