import { Command } from '@grammyjs/commands'
import jwt from 'jsonwebtoken'
import type { BotContext } from '../../context'
import { Role } from '../../db/schema'
import { argument } from '../../middlewares/command/argument'
import { guard } from '../../middlewares/command/guard'
import { commandScopes } from '../commandScopes'

export const userSignCommand = new Command<BotContext>(
  'user_sign',
  'Создать код доступа',
).addToScope(commandScopes.private, [
  guard(Role.ADMIN),
  argument(argument.stringOptional, 'user_sign [роль]'),
  async (context, next) => {
    const logger = context.logger.sub('auth')

    const role =
      typeof context.match === 'string' &&
      context.match.toLowerCase() === 'admin'
        ? 'admin'
        : 'user'

    const publicToken = jwt.sign(
      {
        role,
      },
      process.env.AUTH_SECRET || '',
      { algorithm: 'HS256' },
    )

    logger.info(
      `User @${context.from.username}#${context.from.id} created a ${role} access token`,
    )

    await context.replyWithHTML(
      `🔑 <b>Токен авторизации ${role === 'admin' ? 'администратора' : 'пользователя'} успешно создан!</b>
      
Используйте код с умом: <code>${publicToken}</code>`,
    )

    return next()
  },
])
