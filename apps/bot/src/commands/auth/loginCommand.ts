import { Command } from '@grammyjs/commands'
import jwt from 'jsonwebtoken'
import type { Prisma, Role } from '../../../../../.prisma-generated'
import type { BotContext } from '../../context'
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
        .debug(`Tried to log in with bad authorization token "${publicToken}"`)
        .error(error)
      return
    }

    const chatId = context.chatId.toString()
    const userId = from.id.toString()

    const chat = await context.prisma.chat.upsert({
      where: {
        id: chatId,
      },
      update: {
        token: publicToken,
      },
      create: {
        id: chatId,
        token: publicToken,
      },
    })

    logger.info(`Chat "${chat.id}" has successfully been attached`)

    const userBase: Omit<Prisma.UserCreateInput, 'id' | 'chatId'> = {
      role,
      token: publicToken,
    }

    const user = await context.prisma.user.upsert({
      where: {
        id: userId,
        chatId,
      },
      update: {
        ...userBase,
      },
      create: {
        id: userId,
        chatId,
        ...userBase,
      },
    })

    logger.info(`User "${user.id}" has successfully been authorized`)

    context.session.needUpdateCommands = true

    await context.replyWithHTML(
      `🎉 <b>Добро пожаловать, ${role === 'ADMIN' ? 'администратор' : 'пользователь'}!</b>

Чат и пользователь были успешно авторизованы!`,
    )

    await context.deleteMessage()

    context.auth = {
      chat,
      user,
    }

    return next()
  },
])
