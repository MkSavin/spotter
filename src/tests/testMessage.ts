import dotenv from 'dotenv'
import { initTransport } from '../core/transport'
import { logger } from '../stenograph/log'
import message from './message-1.json'

dotenv.config()

const mqtt = initTransport()

mqtt.on('connect', () => {
  mqtt.publish(
    'frigate/events',
    JSON.stringify(message),
    {
      qos: 2,
      retain: true,
    },
    (error) => {
      if (error) {
        logger.error(error)
      }

      logger.info('Message sent')
      process.exit(0)
    },
  )
})
