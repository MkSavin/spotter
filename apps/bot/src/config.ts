import path from 'node:path'
import process from 'node:process'
import { type RedisConfig, env, resolveRedisConfig } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import information from '../../../package.json'
import type { EndpointCode } from './endpoint/constructEndpoint'
import { applicationLogger } from './log'

export type FrigateConfig = {
  remoteUrl: string
  authSecret: string
  authUser: string
}

export type EnvironmentConfig = {
  timezone: string
  redis: RedisConfig
  telegram: {
    token: string
  }
  database: {
    path: string
  }
  nvr: {
    type: EndpointCode

    frigate: FrigateConfig
  }
  media: {
    strategy: string
  }
}

export type ContentConfig = {
  objectLabels: Record<string, string>
  cameraLabels: Record<string, string>
}

export type Config = EnvironmentConfig & ContentConfig

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
    timezone: env.string('TZ', 'Europe/Moscow'),
    redis: resolveRedisConfig({
      group: 'spotter-bot',
      clientId: information.name,
    }),
    telegram: {
      token: env.string('TELEGRAM_TOKEN', ''),
    },
    database: {
      path: env.string('DATABASE_PATH', './data/bot.sqlite'),
    },
    nvr: {
      type: env.string('NVR_TYPE', 'frigate') as EndpointCode,

      frigate: {
        remoteUrl: env.string('FRIGATE_REMOTE_URL', ''),
        authSecret: env.string('FRIGATE_AUTH_SECRET', ''),
        authUser: env.string('FRIGATE_AUTH_USER', ''),
      },
    },
    media: {
      strategy: env.string('MEDIA_STRATEGY', 'link'),
    },
  }

  if (!environmentConfig.telegram.token) {
    throw new Error('Bad configuration. No telegram token found.')
  }
  if (!environmentConfig.redis.url) {
    throw new Error('Bad configuration. No redis url found.')
  }
  const nvrType = environmentConfig.nvr.type
  const nvrConfig =
    nvrType && nvrType !== 'test' ? environmentConfig.nvr[nvrType] : undefined

  if (nvrConfig && !nvrConfig.remoteUrl) {
    throw new Error(`Bad configuration. No ${nvrType} remote url found.`)
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
