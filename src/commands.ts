import { ListenContext } from './index'
import process from 'process'
import * as console from 'console'

export const listenInput = (
  context: ListenContext,
) => {
  listenStart(context)
  listenTakePhoto()
}

const listenStart = (
  context: ListenContext,
) => {
  const {
    loki,
    bot,
  } = context

  const users = loki.getCollection('users')

  if (!users) {
    console.error('Database error. Users collection not found')
    return
  }

  bot.onText(/\/start(?:\s(.+))?/g, async (message, match) => {
    const user = message.from
    const chatId = message.chat.id

    const passwordRequired = process.env.START_PASSWORD?.trim()
    const passwordInput = match?.[1]?.trim()

    if (passwordInput !== passwordRequired) {
      bot.sendMessage(chatId, 'Введен неверный пароль')
      return
    }

    const listed = users.findOne({
      chatId,
    })

    if (listed) {
      bot.sendMessage(chatId, 'Вы уже зарегистрированы в системе')
      return
    }

    users.insert({
      ...user,
      chatId,
    })

    bot.sendMessage(chatId, 'Вы успешно зарегистрировались в системе удаленного видеонаблюдения')
  })
}

const listenTakePhoto = () => {
  // TODO: integrate
}
