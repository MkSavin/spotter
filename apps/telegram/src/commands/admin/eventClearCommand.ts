import type { BotContext } from '../../context'
import { SpotterCommand } from '../framework/SpotterCommand'

class EventClearCommand extends SpotterCommand {
  readonly name = 'event_clear'
  readonly description = 'Очистить список событий'
  readonly access = 'ADMIN' as const

  async handle(context: BotContext): Promise<void> {
    let reply: Awaited<ReturnType<typeof context.commandBus.send>>
    try {
      reply = await context.commandBus.send('event.clear', {})
    } catch {
      await context.reply('Сервис временно недоступен.')
      return
    }

    if (!reply.ok) {
      await context.reply(`Ошибка: ${reply.error}`)
      return
    }

    const { count } = reply.data as { count: number }

    await context.replyWithHTML(
      `\u{26a0}\u{fe0f} <b>Список событий очищен!</b>

Затронуто событий: ${count}`,
    )
  }
}

export const eventClearCommand = new EventClearCommand()
