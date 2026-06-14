import { Command } from '@grammyjs/commands'
import jwt from 'jsonwebtoken'
import type { BotContext } from '../../context'
import { chatsRepo, usersRepo } from '../../db/repository'
import type { Role } from '../../db/schema'
import { argument } from '../../middlewares/command/argument'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const loginCommand = new Command<BotContext>(
  'login',
  'Авторизоваться в боте',
).addToScope(commandScopes.private, [
  guard('anonymous'),
  sender('present'),
  argument(argument.string, 'login [код доступа]'),
  async (context, next) => {
    const logger = context.logger.sub('auth')

    const from = context.from

    if (!from || typeof context.match !== 'string') {
      return
    }

    const publicToken = context.match.trim()

    let role: Role

    try {
      const payload = jwt.verify(publicToken, process.env.AUTH_SECRET || '', {
        algorithms: ['HS256'],
      })
      role =
        typeof payload === 'object'
          ? typeof payload.role === 'string' &&
            payload.role.toLowerCase() === 'admin'
            ? 'ADMIN'
            : 'USER'
          : 'USER'
    } catch (error) {
      await context.reply('Неверный токен авторизации')
      logger
        .sub(from.id.toString())
        .debug('Tried to log in with an invalid authorization token')
        .error(error)
      return
    }

    const chatId = context.chatId.toString()
    const userId = from.id.toString()

    const chat = chatsRepo.upsert(context.db, {
      id: chatId,
      token: publicToken,
    })

    logger.info(`Chat "${chat.id}" has successfully been attached`)

    const user = usersRepo.upsert(context.db, {
      id: userId,
      chatId,
      role,
      token: publicToken,
    })

    logger.info(`User "${user.id}" has successfully been authorized`)

    context.session.user.needUpdateCommands = true

    await context.replyWithHTML(
      `🎉 <b>Добро пожаловать, ${role === 'ADMIN' ? 'администратор' : 'пользователь'}!</b>

Чат и пользователь были успешно авторизованы!`,
    )

    await context.deleteMessage()

    context.session.user.authorizedRole = user.role

    return next()
  },
])
