import { Command } from '@grammyjs/commands'
import dayjs from 'dayjs'
import type { BotContext } from '../../context'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'

export const meCommand = new Command<BotContext>(
  'me',
  'Информация об авторизации',
).addToScope({ type: 'all_private_chats' }, [
  guard('authorized'),
  sender('present'),
  async (context, next) => {
    if (!context.auth?.user || !context.from) {
      return
    }

    const user = context.auth.user

    await context.replyWithHTML(
      `🤷 <b>Информация об авторизованном пользователе</b>

🧑 @${context.from.username} #${context.from.id}
💼 <b>${user.role === 'ADMIN' ? 'администратор' : 'пользователь'}</b>
📆 авторизация ${dayjs(user.authorizedAt).format('DD.MM.YYYY HH:mm:ss')}`,
    )

    return next()
  },
])
