import { Command } from '@grammyjs/commands'
import type { BotContext } from '../../context'
import { chatsRepo, eventsRepo, usersRepo } from '../../db/repository'
import { Role } from '../../db/schema'
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
    const eventCount = eventsRepo.count(context.db)
    const chatCount = chatsRepo.count(context.db)
    const userCount = usersRepo.count(context.db)

    await context.replyWithHTML(
      `📊 <b>Статистика базы данных</b>

🎥 событий: <b>${eventCount} шт.</b>
💌 чатов: <b>${chatCount} шт.</b>
🙍 пользователей: <b>${userCount} шт.</b>`,
    )

    return next()
  },
])
