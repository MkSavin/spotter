import { defaultLogger } from 'stenograph'
import { kafkaLogging, KafkaRegulator } from '@spotter/transport'
import process from 'node:process'
import { Kafka, Partitioners } from 'kafkajs'
import information from '../package.json'
import { resolveConfig } from './config'
import { connectAsync as mqttConnectAsync } from 'mqtt'
import { MqttRegulator } from './regulators/MqttRegulator'
import type { CoreContext } from './context'
import { frigateEventController } from './mqtt/controllers/frigateEventController'
import { eventTestController } from './kafka/controllers/eventTestController'

export const applicationLogger = defaultLogger.sub('sink')

const run = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = resolveConfig()

  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    logCreator: kafkaLogging(applicationLogger),
    connectionTimeout: 15 * 1000,
  })

  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  })

  await producer.connect()
  const consumer = kafka.consumer({
    groupId: config.kafka.groupId,
    heartbeatInterval: config.kafka.heartbeat,
    sessionTimeout: config.kafka.timeout * 2,
  })

  const mqttClient = await mqttConnectAsync(config.mqtt.broker, {
    connectTimeout: 15 * 1000,
  })

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    await producer.disconnect()
    await mqttClient.endAsync()
    process.exit(1)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const context: CoreContext = {
    mqtt: mqttClient,
    producer,
    consumer,
    config,
    logger: applicationLogger,
  }

  await new MqttRegulator<CoreContext>()
    .on('frigate/events', frigateEventController)
    .run(context)

  await new KafkaRegulator<CoreContext>()
    .on('spotter.event.test_seed', eventTestController)
    .run(context)

  applicationLogger.info('Application successfully started up')
}

run().catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
