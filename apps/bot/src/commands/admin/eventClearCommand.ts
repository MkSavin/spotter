import { Command } from '@grammyjs/commands'
import type { BotContext } from '../../context'
import { eventsRepo } from '../../db/repository'
import { Role } from '../../db/schema'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const eventClearCommand = new Command<BotContext>(
  'event_clear',
  'Очистить список событий',
).addToScope(commandScopes.private, [
  guard(Role.ADMIN),
  sender('present'),
  async (context, next) => {
    const affected = eventsRepo.clear(context.db)

    await context.replyWithHTML(
      `\u{26a0}\u{fe0f} <b>Список событий очищен!</b>

Затронуто событий: ${affected}`,
    )

    return next()
  },
])
