import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { roleTitle } from '../../helpers/role'
import { SpotterCommand } from '../framework/SpotterCommand'

class MeCommand extends SpotterCommand {
  readonly name = 'me'
  readonly description = 'Информация об авторизации'
  readonly access = 'authorized' as const

  // Reads local state only; nothing reaches the NVR.
  protected readonly throttled = false

  async handle(context: BotContext): Promise<void> {
    if (!context.chatId || !context.from) return

    const binding = tgBindingsRepo.find(
      context.db,
      context.from.id.toString(),
      context.chatId.toString(),
    )

    if (!binding) return

    const formattedDate = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(binding.authorizedAt)

    await context.replyWithHTML(
      `🤷 <b>Информация об авторизованном пользователе</b>

🧑 @${context.from.username ?? 'никнейм не задан'} | #${context.from.id}
💼 <b>${roleTitle(binding.role)}</b>
📆 авторизация ${formattedDate}`,
    )
  }
}

export const meCommand = new MeCommand()
