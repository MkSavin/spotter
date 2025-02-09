import dotenv from 'dotenv'
import {initTransport, subscribeTransportTopic} from './core/transport'
import {initBot} from './core/bot'
import {initDatabase} from './core/database'
import {listenInput} from './commands'
import {initCollections} from './models'
import mqtt from 'mqtt'
import TelegramBot from 'node-telegram-bot-api'
import {listenTransport} from './transport'

dotenv.config()

export type ListenContext = {
  loki: Loki,
  mqtt: mqtt.MqttClient,
  bot: TelegramBot,
}

export const initialize = (callback: (context: ListenContext) => void): void => {
  const database = initDatabase()

  database.options.autoloadCallback = () => {
    initCollections(database)

    const mqtt = initTransport()
    subscribeTransportTopic(mqtt, 'frigate/events')

    const bot = initBot()

    callback({
      loki: database,
      mqtt,
      bot,
    })
  }
}

initialize((context) => {
  listenInput(context)
  listenTransport(context)
})
