import mqtt from 'mqtt'
import process from 'process'

export const initTransport = (): mqtt.MqttClient => {
  const host = process.env.MQTT_HOST ?? ''

  console.info(`Connecting to MQTT running on ${host}`)

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
