import { type HeartbeatProps, env } from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

export type CoreConfig = {
  kafka: HeartbeatProps & {
    clientId: string
    brokers: string[]
    groupId: string
  }

  mqtt: {
    broker: string
  }
}

export const resolveConfig = (): CoreConfig => {
  const result: CoreConfig = {
    kafka: {
      clientId: env.string('KAFKA_CLIENT_ID', information.name),
      brokers: env.stringArray('KAFKA_BROKERS', []),
      groupId: env.string('KAFKA_GROUP_ID', 'spotter-sink'),
      heartbeat: env.number('KAFKA_ACTION_HEARTBEAT', 3000),
      timeout: env.number('KAFKA_ACTION_TIMEOUT', 30000),
    },
    mqtt: {
      broker: env.string('MQTT_BROKER', ''),
    },
  }

  if (!result.kafka.brokers.length) {
    throw new Error('No kafka brokers found.')
  }

  if (!result.mqtt.broker.length) {
    throw new Error('No mqtt broker found.')
  }

  applicationLogger.verbose('Using core configuration:', result)

  return result
}
