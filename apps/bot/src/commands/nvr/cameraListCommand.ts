import { Command } from '@grammyjs/commands'
import { Role } from '../../../../../.prisma-generated'
import type { BotContext } from '../../context'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const cameraListCommand = new Command<BotContext>(
  'camera_list',
  'Получить список камер',
).addToScope(commandScopes.private, [
  guard(Role.ADMIN),
  sender('present'),
  async (context, next) => {
    const list = Object.entries(context.config.cameraLabels || {})
      .map(([code, label]) => `- <b>${label}</b> [<code>${code}</code>]`)
      .join('\n')

    await context.replyWithHTML(`📷 <b>Список доступных камер:</b>\n\n${list}`)
    return next()
  },
])
