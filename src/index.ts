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

const init = () => {
  const database = initDatabase()

  database.options.autoloadCallback = () => {
    initCollections(database)

    const mqtt = initTransport()
    subscribeTransportTopic(mqtt, 'frigate/events')

    const bot = initBot()

    const context = {
      loki: database,
      mqtt,
      bot,
    }

    listenInput(context)
    listenTransport(context)
  }
}

init()
