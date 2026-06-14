import { Command } from '@grammyjs/commands'
import type { BotContext } from '../../context'
import { usersRepo } from '../../db/repository'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'

export const meCommand = new Command<BotContext>(
  'me',
  'Информация об авторизации',
).addToScope({ type: 'all_private_chats' }, [
  guard('authorized'),
  sender('present'),
  async (context, next) => {
    if (!context.chatId || !context.from) {
      return
    }

    const user = usersRepo.find(
      context.db,
      context.from.id.toString(),
      context.chatId.toString(),
    )

    if (!user) {
      return
    }

    const formattedDate = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(user.authorizedAt)

    await context.replyWithHTML(
      `🤷 <b>Информация об авторизованном пользователе</b>

🧑 @${context.from.username ?? 'никнейм не задан'} | #${context.from.id}
💼 <b>${user.role === 'ADMIN' ? 'администратор' : 'пользователь'}</b>
📆 авторизация ${formattedDate}`,
    )

    return next()
  },
])
