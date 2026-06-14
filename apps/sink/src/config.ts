import { type RedisConfig, env, resolveRedisConfig } from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'
import type { SourceCode } from './source/constructSource'

export type CoreConfig = {
  redis: RedisConfig

  source: {
    type: SourceCode
    frigate: {
      broker: string
    }
  }
}

export const resolveConfig = (): CoreConfig => {
  const result: CoreConfig = {
    redis: resolveRedisConfig({
      group: 'spotter-sink',
      clientId: information.name,
    }),
    source: {
      type: env.string('SOURCE_TYPE', 'frigate') as SourceCode,
      frigate: {
        broker: env.string('MQTT_BROKER', ''),
      },
    },
  }

  if (!result.redis.url) {
    throw new Error('No redis url found.')
  }

  if (result.source.type === 'frigate' && !result.source.frigate.broker) {
    throw new Error('No mqtt broker found for the frigate source.')
  }

  applicationLogger.verbose('Using core configuration:', result)

  return result
}
