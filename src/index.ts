import dotenv from 'dotenv'
import type Loki from 'lokijs'
import type mqtt from 'mqtt'
import type TelegramBot from 'node-telegram-bot-api'
import { initBot } from './core/bot'
import { initDatabase } from './core/database'
import { initTransport, subscribeTransportTopic } from './core/transport'
import { initCollections } from './models'
import './commands/VersionCommand'
import { service } from './service'

dotenv.config()

export type ListenContext = {
  loki: Loki
  mqtt: mqtt.MqttClient
  bot: TelegramBot
}

export const initialize = (
  callback: (context: ListenContext) => void,
): void => {
  const database = initDatabase()

  database.options.autoloadCallback = () => {
    initCollections(database)

    const transportClient = initTransport()
    subscribeTransportTopic(transportClient, 'frigate/events')

    const bot = initBot()

    callback({
      loki: database,
      mqtt: transportClient,
      bot,
    })
  }
}

initialize(service)
