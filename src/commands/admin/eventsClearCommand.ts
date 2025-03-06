import { Command } from '@grammyjs/commands'
import { $Enums } from '@prisma/client'
import type { Context } from '../../context'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const eventsClearCommand = new Command<Context>(
  'events_clear',
  'Очистить список событий',
).addToScope(commandScopes.private, [
  guard($Enums.Role.ADMIN),
  sender('present'),
  async (context, next) => {
    const list = await context.prisma.event.deleteMany()

    await context.replyWithHTML(
      `\u{26a0}\u{fe0f} <b>Список событий очищен</b>

Затронуто событий: ${list.count}`,
    )

    return next()
  },
])
