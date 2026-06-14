import { Command } from '@grammyjs/commands'
import Bun from 'bun'
import information from '../../../package.json'
import type { BotContext } from '../../context'
import { Role } from '../../db/schema'
import { guard } from '../../middlewares/command/guard'
import { commandScopes } from '../commandScopes'

export const systemVersionCommand = new Command<BotContext>(
  'system_version',
  'Узнать информацию о версии бота и платформы',
).addToScope(commandScopes.private, [
  guard(Role.ADMIN),
  async (context, next) => {
    await context.replyWithHTML(
      `🤷 <b>Информация о развернутом приложении</b>

Приложение: <code>${information.name} v${information.version}</code>
Платформа: <code>Bun ${Bun.version_with_sha}</code>`,
    )

    return next()
  },
])
