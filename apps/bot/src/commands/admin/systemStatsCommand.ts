import { Command } from '@grammyjs/commands'
import { Role } from '../../../../../.prisma-generated'
import type { BotContext } from '../../context'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const systemStatsCommand = new Command<BotContext>(
  'system_stats',
  'Статистика базы данных',
).addToScope(commandScopes.private, [
  guard(Role.ADMIN),
  sender('present'),
  async (context, next) => {
    const eventCount = await context.prisma.event.count()
    const chatCount = await context.prisma.chat.count()
    const userCount = await context.prisma.user.count()

    await context.replyWithHTML(
      `📊 <b>Статистика базы данных</b>

🎥 событий: <b>${eventCount} шт.</b>
💌 чатов: <b>${chatCount} шт.</b>
🙍 пользователей: <b>${userCount} шт.</b>`,
    )

    return next()
  },
])
