import type { BotContext } from '../../context'
import { eventsRepo } from '../../db/repository'
import { SpotterCommand } from '../framework/SpotterCommand'

class EventClearCommand extends SpotterCommand {
  readonly name = 'event_clear'
  readonly description = 'Очистить список событий'
  readonly access = 'ADMIN' as const

  async handle(context: BotContext): Promise<void> {
    const affected = eventsRepo.clear(context.db)

    await context.replyWithHTML(
      `\u{26a0}\u{fe0f} <b>Список событий очищен!</b>

Затронуто событий: ${affected}`,
    )
  }
}

export const eventClearCommand = new EventClearCommand()
