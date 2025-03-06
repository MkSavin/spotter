import process from 'node:process'
import { loadConfig } from 'c12'
import type { Config, ContentConfig } from './context'

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

  const { config } = await loadConfig<ContentConfig>({
    defaults: {
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
  })

  return {
    token,
    mqttUrl,
    databaseUrl,
    frigateRemoteUrl,
    ...config,
  }
}
