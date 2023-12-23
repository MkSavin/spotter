import { ListenContext } from './index'
import process from 'process'
import * as console from 'console'
import dayjs from 'dayjs'

export const listenInput = (
  context: ListenContext,
) => {
  listenStart(context)
  listenMute(context)
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
      await bot.sendMessage(chatId, 'Введен неверный пароль')
      return
    }

    const listed = users.findOne({
      chatId,
    })

    if (listed) {
      await bot.sendMessage(chatId, 'Вы уже зарегистрированы в системе')
      return
    }

    users.insert({
      ...user,
      chatId,
    })

    await bot.sendMessage(chatId, 'Вы успешно зарегистрировались в системе удаленного видеонаблюдения')
  })
}

const listenMute = (
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

  bot.onText(/\/mute(?:\s(?:(?<h>\d+)h)?(?:(?<m>\d+)(?:m|))?)?/gi, async (message, match) => {
    const chatId = message.chat.id

    const groups = match?.groups

    const hours = Number(groups?.h ?? 0)
    const mins = Number(groups?.m ?? (hours === 0 ? 10 : 0))

    const muteTo = dayjs()
      .add(hours, 'h')
      .add(mins, 'm')

    const listed = users.findOne({
      chatId,
    })

    users.update({
      ...listed,
      mute: muteTo
        .toISOString(),
    })

    await bot.sendMessage(chatId, `События будут игнорироваться до \`${muteTo.format('DD.MM.YYYY hh:mm')}\``)
  })

  bot.onText(/\/unmute/gi, async (message, match) => {
    const chatId = message.chat.id

    const listed = users.findOne({
      chatId,
    })

    users.update({
      ...listed,
      mute: undefined,
    })

    await bot.sendMessage(chatId, `Игнорирование событий отключено`)
  })
}

const listenTakePhoto = () => {
  // TODO: integrate
}
