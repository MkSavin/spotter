import {ListenContext} from './index'
import process from 'process'
import {User} from './models'
import {logger} from './stenograph/log'

export const listenInput = (
  context: ListenContext,
) => {
  listenStart(context)
  listenTakePhoto()
}

const authLogger = logger.sub('authorization')

const listenStart = (
  context: ListenContext,
) => {
  const {
    loki,
    bot,
  } = context

  const users = loki.getCollection<User>('users')

  if (!users) {
    authLogger.error('Database error. Users collection not found')
    return
  }

  bot.onText(/\/start(?:\s(.+))?/g, async (message, match) => {
    const user = message.from
    const chatId = message.chat.id

    const passwordRequired = process.env.START_PASSWORD?.trim()
    const passwordInput = match?.[1]?.trim()

    const userLogger = authLogger.sub(`${user?.id ?? 'unknown'}`)

    userLogger.debug('New log in attempt')

    if (!user) {
      userLogger.debug('Log in attempt is aborted due to empty user data')
      await bot.sendMessage(chatId, 'Информация о пользователе не найдена')
      return
    }

    if (passwordInput !== passwordRequired) {
      userLogger.debug('User entered wrong password')
      await bot.sendMessage(chatId, 'Введен неверный пароль')
      return
    }

    const listed = users.findOne({
      chatId,
    })

    if (listed) {
      userLogger.debug('User has already been logged in')
      await bot.sendMessage(chatId, 'Вы уже зарегистрированы в системе')
      return
    }

    users.insert({
      ...user,
      chatId,
    })

    userLogger.info('User is successfully registered and logged in')

    await bot.sendMessage(chatId, 'Вы успешно зарегистрировались в системе удаленного видеонаблюдения')
  })
}

const listenTakePhoto = () => {
  // TODO: integrate
}
