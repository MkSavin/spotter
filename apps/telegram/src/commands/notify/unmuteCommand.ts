import type { BotContext } from '../../context'
import { tgChatsRepo } from '../../db/repository'
import { SpotterCommand } from '../framework/SpotterCommand'

class UnmuteCommand extends SpotterCommand {
  readonly name = 'unmute'
  readonly description = 'Вернуть уведомления'
  readonly access = 'authorized' as const

  // Writes one local row; nothing reaches the NVR.
  protected readonly throttled = false

  async handle(context: BotContext): Promise<void> {
    if (!context.chatId) return

    const chatId = context.chatId.toString()
    const chat = tgChatsRepo.find(context.db, chatId)
    const wasMuted = !!chat?.mutedUntil && chat.mutedUntil > new Date()

    tgChatsRepo.setMuted(context.db, chatId, null)

    await context.replyWithHTML(
      wasMuted
        ? '🔔 <b>Уведомления снова включены</b>\n\nСобытия за время тишины не досылаются.'
        : '🔔 <b>Уведомления и так включены</b>',
    )
  }
}

export const unmuteCommand = new UnmuteCommand()
