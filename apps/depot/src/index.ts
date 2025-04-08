import process from 'node:process'
import { KafkaRegulator, kafkaLogging } from '@spotter/transport'
import { S3Client } from 'bun'
import { Kafka, Partitioners } from 'kafkajs'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { cameraFrameController } from './controllers/cameraFrameController'
import { eventMediaController } from './controllers/eventMediaController'
import { temp } from './fs/temp'
import { applicationLogger } from './log'

const run = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = resolveConfig()

  const s3 = new S3Client({
    endpoint: config.s3.host,
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
    bucket: config.s3.bucket,
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
      .message('spotter.event.media_requested', eventMediaController)
      .message('spotter.camera.frame_requested', cameraFrameController)
      .run({
        directory: {
          temp: tempDir,
        },
        logger: applicationLogger,
        config,
        s3,
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
