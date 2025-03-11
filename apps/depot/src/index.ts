import path from 'node:path'
import dotenv from 'dotenv'
import { Kafka } from 'kafkajs'
import information from '../package.json'
import {
  type EventMediaPayload,
  eventMediaAction,
} from './actions/eventMediaAction'
import { ConsumeController } from './helpers/ConsumeController'
import { bufferToJson } from './helpers/bufferToJson'
import { depotLogger, logging } from './log'

dotenv.config()

const run = async (): Promise<void> => {
  const clientId = process.env.KAFKA_CLIENT_ID ?? information.name
  const brokers = (process.env.KAFKA_BROKER_HOST ?? '').split(',')
  const groupId = process.env.KAFKA_GROUP_ID ?? 'spotter-depot'

  if (!brokers.length) {
    throw new Error('No brokers found.')
  }

  depotLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  depotLogger.verbose('Using core configuration:', {
    clientId,
    brokers,
    groupId,
  })

  const kafka = new Kafka({
    clientId,
    brokers,
    logCreator: logging,
  })

  // const producer = kafka.producer()
  const consumer = kafka.consumer({ groupId })

  const consumeController = new ConsumeController()
    .on('spotter-media-event', async ({ message }) => {
      const value = bufferToJson(message.value)

      console.log(value)

      if (!value) {
        return
      }

      const payload: EventMediaPayload = {
        eventId: value.eventId ?? '',
        clipUrl: value.clipUrl ?? undefined,
        snapshotUrl: value.snapshotUrl ?? undefined,
      }

      await eventMediaAction(payload)
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
