import process from 'node:process'
import {
  RedisRegulator,
  type StreamMessageController,
  StreamProducer,
  connectRedis,
  mediaStreams,
} from '@spotter/transport'
import { RedisClient, S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { Catalog } from '../catalog/Catalog'
import { publishCatalog } from '../catalog/publishCatalog'
import type { SinkConfig } from '../config/sinkConfig'
import { publishEvent } from '../helpers/publishEvent'
import type { MediaProvider } from '../media/MediaProvider'
import { createCameraController } from '../media/createCameraController'
import { createMediaController } from '../media/createMediaController'
import type { Source, SourceHandle } from '../source/Source'
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
  /** Extra stream subscriptions (e.g. a test-seed controller). */
  controllers?: SinkController<TConfig>[]
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
    controllers = [],
  } = options

  const sourceId = options.sourceId ?? source.code

  logger.info(
    `Initializing ${information.name} v${information.version} (source: ${sourceId})...`,
  )

  // Dedicated blocking connection for XREADGROUP; the producer connection stays
  // free for XADD (ingested events + staged media) and the regulator's acks.
  const subscriber = new RedisClient(config.redis.url)
  const producer = new StreamProducer(
    new RedisClient(config.redis.url),
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
  await connectRedis(subscriber, { url: config.redis.url })

  let sourceHandle: SourceHandle | null = null
  let transport: Awaited<
    ReturnType<RedisRegulator<SinkContext<TConfig>>['run']>
  > | null = null

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Shutting down due to ${signal}...`)
    await transport?.stop()
    await sourceHandle?.stop()
    subscriber.close()
    producer.disconnect()
    process.exit(1)
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
    await publishCatalog(catalog, sourceId, producer, logger)
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
