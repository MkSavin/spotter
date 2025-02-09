import Loki from 'lokijs'
import TelegramBot from 'node-telegram-bot-api'

export type User = TelegramBot.User & {
  chatId: number,
}

export const initCollections = (
  loki: Loki,
) => {
  [ 'users', 'events' ].forEach((code) => {
    if (!loki.getCollection(code)) {
      loki.addCollection(code)
    }
  })
}
