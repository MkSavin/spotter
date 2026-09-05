import type { BotContext } from '../../context'
import { askDomain } from '../framework/askDomain'
import { SpotterCommand } from '../framework/SpotterCommand'

class EventClearCommand extends SpotterCommand {
  readonly name = 'event_clear'
  readonly description = 'Очистить список событий'
  readonly access = 'ADMIN' as const

  async handle(context: BotContext): Promise<void> {
    const reply = await askDomain(context, 'event.clear')
    if (!reply) return

    const { count } = reply.data as { count: number }

    await context.replyWithHTML(
      `\u{26a0}\u{fe0f} <b>Список событий очищен!</b>

Затронуто событий: ${count}`,
    )
  }
}

export const eventClearCommand = new EventClearCommand()
