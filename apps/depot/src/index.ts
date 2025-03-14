import process from 'node:process'
import { KafkaRegulator } from '@spotter/transport'
import { Kafka, Partitioners } from 'kafkajs'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { cameraFrameController } from './controllers/cameraFrameController'
import { eventMediaController } from './controllers/eventMediaController'
import { dir } from './fs/dir'
import { temp } from './fs/temp'
import { depotLogger, logging } from './log'

const run = async (): Promise<void> => {
  depotLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = resolveConfig()

  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    logCreator: logging,
  })

  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  })
  const consumer = kafka.consumer({
    groupId: config.kafka.groupId,
    heartbeatInterval: config.action.heartbeat,
    sessionTimeout: config.action.timeout * 2,
  })

  const regulator = new KafkaRegulator<CoreContext>()
    .on('spotter.event.media_requested', eventMediaController)
    .on('spotter.camera.frame_requested', cameraFrameController)

  const tempDir = await temp('spotter-depot-media-')
  const destinationDir = await dir(config.media.publicPath)

  const shutdown = async (signal: NodeJS.Signals) => {
    depotLogger.info(`Shutting down due to ${signal}...`)
    producer.disconnect()
    consumer.disconnect()
    process.exit(1)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await producer.connect()

    await regulator.run({
      directory: {
        temp: tempDir,
        destination: destinationDir,
      },
      logger: depotLogger,
      config,
      consumer,
      producer,
    })
  } finally {
    await tempDir.remove()
  }
}

run().catch((error) => {
  depotLogger.error(error)
  process.exit(1)
})
