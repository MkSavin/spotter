import path from 'node:path'
import process from 'node:process'
import type { Config, ContentConfig } from './context'
import { logger as baseLogger } from './log'

const logger = baseLogger.sub('config')

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

export const pullConfig = async (): Promise<Config> => {
  const token = process.env.TELEGRAM_TOKEN
  const mqttUrl = process.env.MQTT_URL
  const databaseUrl = process.env.DATABASE_URL
  const frigateRemoteUrl = process.env.FRIGATE_REMOTE_URL

  if (!token) {
    throw new Error('Bad configuration. Token is missing')
  }
  if (!mqttUrl) {
    throw new Error('Bad configuration. MQTT host is not assigned')
  }
  if (!databaseUrl) {
    throw new Error('Bad configuration. Database host is not assigned')
  }
  if (!frigateRemoteUrl) {
    throw new Error('Bad configuration. Frigate remote host is not assigned')
  }

  const config: ContentConfig = await tryReadContentConfig(
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

  return {
    token,
    mqttUrl,
    databaseUrl,
    frigateRemoteUrl,
    ...config,
  }
}
