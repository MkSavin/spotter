import process from 'node:process'
import { kafkaLogging, KafkaRegulator } from '@spotter/transport'
import { Kafka, Partitioners } from 'kafkajs'
import { Client as MinioClient } from 'minio'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { cameraFrameController } from './controllers/cameraFrameController'
import { eventMediaController } from './controllers/eventMediaController'
import { temp } from './fs/temp'
import { defaultLogger } from 'stenograph'

export const applicationLogger = defaultLogger.sub('depot')

const run = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = resolveConfig()

  const minio = new MinioClient({
    endPoint: config.minio.host,
    port: config.minio.port,
    useSSL: config.minio.ssl,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
  })

  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    logCreator: kafkaLogging(applicationLogger),
  })

  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  })
  const consumer = kafka.consumer({
    groupId: config.kafka.groupId,
    heartbeatInterval: config.kafka.heartbeat,
    sessionTimeout: config.kafka.timeout * 2,
  })

  const tempDir = await temp('spotter-depot-media-')

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    await producer.disconnect()
    await consumer.disconnect()
    process.exit(1)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await producer.connect()

    await new KafkaRegulator<CoreContext>()
      .on('spotter.event.media_requested', eventMediaController)
      .on('spotter.camera.frame_requested', cameraFrameController)
      .run({
        directory: {
          temp: tempDir,
        },
        logger: applicationLogger,
        config,
        minio,
        consumer,
        producer,
      })

    applicationLogger.info('Application successfully started up')
  } finally {
    await tempDir.remove()
  }
}

run().catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
