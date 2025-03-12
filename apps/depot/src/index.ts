import dotenv from 'dotenv'
import { Kafka } from 'kafkajs'
import information from '../package.json'
import {
  type EventMediaPayload,
  eventMediaAction,
} from './actions/eventMediaAction'
import { ConsumeController } from './helpers/ConsumeController'
import { bufferToJson } from './helpers/bufferToJson'
import { env } from './helpers/env'
import {
  actionInterval,
  actionTimeout,
  intervalHeartbeat,
} from './helpers/intervalHeartbeat'
import { depotLogger, logging } from './log'

dotenv.config()

const run = async (): Promise<void> => {
  const config = {
    clientId: env.string('KAFKA_CLIENT_ID', information.name),
    brokers: env.stringArray('KAFKA_BROKER_HOST', []),
    groupId: env.string('KAFKA_GROUP_ID', 'spotter-depot'),
  }

  if (!config.brokers.length) {
    throw new Error('No brokers found.')
  }

  depotLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  depotLogger.verbose('Using core configuration:', config)

  const kafka = new Kafka({
    clientId: config.clientId,
    brokers: config.brokers,
    logCreator: logging,
  })

  // const producer = kafka.producer()
  const consumer = kafka.consumer({
    groupId: config.groupId,
    heartbeatInterval: actionInterval,
    sessionTimeout: actionTimeout * 2,
  })

  const consumeController = new ConsumeController()
    .on('spotter-media-event', async ({ message, heartbeat }) => {
      const value = bufferToJson(message.value)

      if (!value) {
        return
      }

      const payload: EventMediaPayload = {
        eventId: value.eventId ?? '',
        clipUrl: value.clipUrl ?? undefined,
        snapshotUrl: value.snapshotUrl ?? undefined,
        endpointAuthorization: value.endpointAuthorization,
      }

      await intervalHeartbeat(heartbeat, async () => {
        await eventMediaAction(payload)
      })
    })
    .on('spotter-media-lastFrame', async ({ topic, message }) => {
      console.log(topic, message.key, message.value?.toString())
      /*
      0. create temp dir
      1. download image to temp dir
      2. process image to new file
      3. return link to new image
      */
    })

  await consumer.connect()
  await consumer.subscribe({
    topics: consumeController.topics,
    fromBeginning: true,
  })

  await consumer.run({
    eachMessage: (message) => consumeController.consumeMessages(message),
  })
}

run().catch((error) => {
  depotLogger.error(error)
  process.exit(1)
})
