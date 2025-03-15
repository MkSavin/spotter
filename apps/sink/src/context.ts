import type { Consumer, Producer } from 'kafkajs'
import type { MqttClient } from 'mqtt'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from './config'

export type CoreContext = {
  config: CoreConfig
  logger: Stenograph
  mqtt: MqttClient
  producer: Producer
  consumer: Consumer
}
