import type Loki from 'lokijs'
import type TelegramBot from 'node-telegram-bot-api'

export type User = TelegramBot.User & {
  chatId: number
}

export const initCollections = (loki: Loki): void => {
  ;['users', 'events'].forEach((code) => {
    if (!loki.getCollection(code)) {
      loki.addCollection(code)
    }
  })
}
