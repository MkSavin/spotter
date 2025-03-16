import path from 'node:path'
import process from 'node:process'
import { env } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import information from '../../../package.json'
import type { Config, ContentConfig, EnvironmentConfig } from './context'
import { applicationLogger } from './log'

const logger = defaultLogger.sub('config')

const tryReadContentConfig = async (
  filePath: string,
  defaultConfig: ContentConfig,
): Promise<ContentConfig> => {
  try {
    const imported = await import(filePath)

    logger.debug(`Using config file on path ${filePath}`)

    return {
      ...defaultConfig,
      ...imported.default,
    }
  } catch (e) {
    logger.debug('Config file not found. Falling back to default settings')
    return defaultConfig
  }
}

export const resolveConfig = async (): Promise<Config> => {
  const environmentConfig: EnvironmentConfig = {
    kafka: {
      clientId: env.string('KAFKA_CLIENT_ID', information.name),
      brokers: env.stringArray('KAFKA_BROKERS', []),
      groupId: env.string('KAFKA_GROUP_ID', 'spotter-sink'),
      heartbeat: env.number('KAFKA_ACTION_HEARTBEAT', 3000),
      timeout: env.number('KAFKA_ACTION_TIMEOUT', 30000),
    },
    telegram: {
      token: env.string('TELEGRAM_TOKEN', ''),
    },
    database: {
      url: env.string('DATABASE_URL', ''),
    },
    frigate: {
      remoteUrl: env.string('FRIGATE_REMOTE_URL', ''),
    },
  }

  if (!environmentConfig.telegram.token) {
    throw new Error('Bad configuration. No telegram token found.')
  }
  if (!environmentConfig.kafka.brokers.length) {
    throw new Error('Bad configuration. No kafka brokers found.')
  }
  if (!environmentConfig.frigate.remoteUrl) {
    throw new Error('Bad configuration. No frigate remote url found.')
  }
  if (!environmentConfig.database.url) {
    throw new Error('Bad configuration. No database url found.')
  }

  const contentConfig: ContentConfig = await tryReadContentConfig(
    path.resolve(process.cwd(), 'config.ts'),
    {
      objectLabels: {
        person: '🧍 человек',
        car: '🚗 машина',
        dog: '🐶 собака',
        cat: '😺 кот',
        horse: '🐎 лошадь',
        bear: '🐻 медведь',
      },
      cameraLabels: {
        front: '🎥 передняя',
        side: '🎥 боковая',
      },
    },
  )

  const config = {
    ...environmentConfig,
    ...contentConfig,
  }

  applicationLogger.verbose('Using core configuration:', config)

  return config
}
