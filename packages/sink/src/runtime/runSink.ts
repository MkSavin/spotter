import process from 'node:process'
import {
  catalogRequestStream,
  mediaStreams,
  notificationStreams,
  RedisConnection,
  RedisRegulator,
  type StreamMessageController,
  StreamProducer,
  startHeartbeat,
  startLiveness,
  timelapseStreams,
} from '@spotter/transport'
import { S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { Catalog } from '../catalog/Catalog'
import { createCatalogRequestController } from '../catalog/createCatalogRequestController'
import {
  type CatalogHandle,
  keepCatalogPublished,
} from '../catalog/keepCatalogPublished'
import type { SinkConfig } from '../config/sinkConfig'
import { publishEvent } from '../helpers/publishEvent'
import { createCameraController } from '../media/createCameraController'
import { createMediaController } from '../media/createMediaController'
import type { MediaProvider } from '../media/MediaProvider'
import { createSuspendController } from '../notifications/createSuspendController'
import type { NotificationSuspender } from '../notifications/NotificationSuspender'
import type { Source, SourceHandle } from '../source/Source'
import { createTimelapseController } from '../timelapse/createTimelapseController'
import { FileTimelapseStore } from '../timelapse/FileTimelapseStore'
import type { TimelapseProvider } from '../timelapse/TimelapseProvider'
import { TimelapseTracker } from '../timelapse/TimelapseTracker'
import type { SinkContext } from './context'

/** A stream subscription an adapter wants the runtime to register. */
export type SinkController<TConfig extends SinkConfig> = {
  stream: string
  controller: StreamMessageController<SinkContext<TConfig>>
}

export type RunSinkOptions<TConfig extends SinkConfig> = {
  config: TConfig
  logger: Stenograph
  information: { name: string; version: string }
  /**
   * Routing id of this adapter instance — the `<source>` in stream/key names
   * and the value stamped onto every emitted event. Defaults to `source.code`.
   */
  sourceId?: string
  /** The NVR ingestion adapter. Emits canonical events; runtime publishes them. */
  source: Source<TConfig>
  /** Resolves NVR media on demand; enables the media/camera request consumers. */
  mediaProvider?: MediaProvider
  /** Owns the NVR taxonomy; published to `spotter.catalog.<source>` on startup. */
  catalog?: Catalog
  /** Exports spans of recordings; enables the timelapse consumer. */
  timelapseProvider?: TimelapseProvider
  /** Suspends the NVR's own notifications; enables the suspend consumer. */
  notificationSuspender?: NotificationSuspender
  /** Where in-flight exports are remembered across restarts. */
  timelapseStatePath?: string
  /** How long an export may run before it is given up on. */
  timelapseDeadlineMs?: number
  /** Extra stream subscriptions (e.g. a test-seed controller). */
  controllers?: SinkController<TConfig>[]
  /** Extras for `/status`, e.g. the NVR build behind this adapter. */
  heartbeatDetails?: () =>
    | Promise<Record<string, string>>
    | Record<string, string>
}

/**
 * Boots a sink adapter: wires Redis (+ S3 when configured), runs the source's
 * ingest loop (stamping `source` and publishing to `spotter.event`), registers
 * the media/camera request consumers when a MediaProvider is supplied and
 * publishes the catalog snapshot. Owns process lifecycle (SIGINT/SIGTERM). The
 * function resolves once startup completes; the process stays alive on the open
 * connections.
 */
export const runSink = async <TConfig extends SinkConfig>(
  options: RunSinkOptions<TConfig>,
): Promise<void> => {
  const {
    config,
    logger,
    information,
    source,
    mediaProvider,
    catalog,
    timelapseProvider,
    notificationSuspender,
    controllers = [],
  } = options

  const sourceId = options.sourceId ?? source.code

  logger.info(
    `Initializing ${information.name} v${information.version} (source: ${sourceId})...`,
  )

  // Dedicated blocking connection for XREADGROUP; the producer connection stays
  // free for XADD (ingested events + staged media) and the regulator's acks.
  const subscriber = new RedisConnection(config.redis.url)
  const producer = new StreamProducer(
    new RedisConnection(config.redis.url),
    config.redis.maxLen,
  )

  const s3 = config.s3
    ? new S3Client({
        endpoint: config.s3.host,
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
        bucket: config.s3.bucket,
      })
    : null

  await producer.connect()
  await subscriber.connect()

  let sourceHandle: SourceHandle | null = null
  let stopHeartbeat: (() => void) | null = null
  let stopLiveness: (() => void) | null = null
  let catalogHandle: CatalogHandle | null = null
  let timelapse: TimelapseTracker | null = null
  let transport: Awaited<
    ReturnType<RedisRegulator<SinkContext<TConfig>>['run']>
  > | null = null

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Shutting down due to ${signal}...`)
    stopHeartbeat?.()
    stopLiveness?.()
    catalogHandle?.stop()
    timelapse?.stop()
    await transport?.stop()
    await sourceHandle?.stop()
    subscriber.close()
    producer.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const context: SinkContext<TConfig> = {
    producer,
    subscriber,
    config,
    logger,
    sourceId,
    s3,
  }

  // Pluggable NVR ingestion: one source per sink instance. The source emits
  // canonical SpotterEvents; we stamp the routing source and publish them.
  sourceHandle = await source.run(async (event) => {
    await publishEvent({ ...event, source: sourceId }, producer)
  })

  if (catalog) {
    catalogHandle = keepCatalogPublished(catalog, sourceId, producer, logger)
  }

  stopHeartbeat = startHeartbeat(producer, {
    service: information.name.replace(/^@spotter\//, ''),
    version: information.version,
    details: options.heartbeatDetails,
  })

  // Healthcheck signal: refreshed only while Redis actually answers, so a
  // wedged-but-running container fails its healthcheck and gets restarted.
  stopLiveness = startLiveness({
    check: async () => {
      await subscriber.send('PING', [])
      return true
    },
  })

  if (timelapseProvider && s3 && config.s3) {
    timelapse = new TimelapseTracker({
      provider: timelapseProvider,
      producer,
      s3,
      stagingPrefix: config.s3.stagingPrefix,
      sourceId,
      deadlineMs: options.timelapseDeadlineMs,
      logger: logger.sub('timelapse'),
      store: options.timelapseStatePath
        ? new FileTimelapseStore(
            options.timelapseStatePath,
            logger.sub('timelapse'),
          )
        : undefined,
    })

    // Exports started by a previous process are still running on the NVR; pick
    // them back up rather than leaving the requester waiting forever.
    await timelapse
      .recover(logger.sub('timelapse'))
      .catch((error) => logger.warn('Could not recover exports', error))
  }

  const regulator = new RedisRegulator<SinkContext<TConfig>>()

  if (mediaProvider) {
    regulator.message(
      mediaStreams.mediaRequest(sourceId),
      createMediaController<TConfig>(mediaProvider),
    )
    regulator.message(
      mediaStreams.cameraRequest(sourceId),
      createCameraController<TConfig>(mediaProvider),
    )
  }

  if (timelapse) {
    regulator.message(
      timelapseStreams.request(sourceId),
      createTimelapseController<TConfig>(timelapse),
    )
  }

  if (notificationSuspender) {
    regulator.message(
      notificationStreams.suspend(sourceId),
      createSuspendController<TConfig>(notificationSuspender),
    )
  }

  if (catalogHandle) {
    regulator.message(
      catalogRequestStream,
      createCatalogRequestController<TConfig>(catalogHandle.republish),
    )
  }

  for (const { stream, controller } of controllers) {
    regulator.message(stream, controller)
  }

  transport = await regulator.run(context, {
    group: config.redis.group,
    consumer: config.redis.consumer,
    blockMs: config.redis.blockMs,
    count: config.redis.count,
    reclaimMinIdleMs: config.redis.reclaimMinIdleMs,
    reaperIntervalMs: config.redis.reaperIntervalMs,
    maxDeliveries: config.redis.maxDeliveries,
  })

  logger.info('Application successfully started up')
}
