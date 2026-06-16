import type { BotContext } from '../../context'
import { eventsRepo } from '../../db/repository'
import { argument } from '../../middlewares/command/argument'
import { eventCode } from '../../transport/helpers/eventCode'
import { renderEvent } from '../../transport/view/renderEvent'
import { SpotterCommand } from '../framework/SpotterCommand'

class EventInfoCommand extends SpotterCommand {
  readonly name = 'event_info'
  readonly description = 'Информация о событии'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.string
  protected readonly signature = 'event_info [код]'

  async handle(context: BotContext): Promise<void> {
    if (typeof context.match !== 'string') {
      return
    }

    const code = context.match.trim()

    const event = eventsRepo.findByCode(context.db, code, eventCode)

    if (!event) {
      await context.replyWithHTML(
        `🔍 <b>Событие с кодом <code>${code}</code> не найдено</b>`,
      )
      return
    }

    await context.replyWithHTML(
      `${renderEvent(event, context)}

🆔 <code>${event.id}</code>
💌 уведомлений: ${event.messages.length} шт.`,
    )
  }
}

export const eventInfoCommand = new EventInfoCommand()
