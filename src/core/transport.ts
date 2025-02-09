import mqtt from 'mqtt'
import process from 'process'
import { logger } from '../stenograph/log'

export const initTransport = (): mqtt.MqttClient => {
  const host = process.env.MQTT_HOST ?? ''
  const frigateHost = process.env.FRIGATE_HOST ?? ''

  logger.sub('init').info(`Connecting to MQTT running on ${host}`)
  logger.sub('init').info(`Connecting to frigate running on ${frigateHost}`)

  return mqtt.connect(host)
}

export const subscribeTransportTopic = (
  transport: mqtt.MqttClient,
  topic: string,
): Promise<string> => (
  new Promise((resolve, reject) => {
    transport.on('connect', () => {
      transport.subscribe(topic, (error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(topic)
      })
    })
  })
)
