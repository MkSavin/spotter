import { Command } from '@grammyjs/commands'
import { $Enums } from '@prisma/client'
import Bun from 'bun'
import information from '../../../../../package.json'
import type { BotContext } from '../../context'
import { guard } from '../../middlewares/command/guard'
import { commandScopes } from '../commandScopes'

export const versionCommand = new Command<BotContext>(
  'version',
  'Узнать информацию о версии бота и платформы',
).addToScope(commandScopes.private, [
  guard($Enums.Role.ADMIN),
  async (context, next) => {
    await context.replyWithHTML(
      `🤷 <b>Информация о развернутом приложении</b>

Приложение: <code>${information.name} v${information.version}</code>
Платформа: <code>Bun ${Bun.version_with_sha}</code>`,
    )

    return next()
  },
])
