import type { SpotterEvent } from '@spotter/transport'
import type { BotContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import { escapeHtml } from '../../helpers/html'
import { renderEvent } from '../../transport/view/renderEvent'
import { SpotterCommand } from '../framework/SpotterCommand'

class EventInfoCommand extends SpotterCommand {
  readonly name = 'event_info'
  readonly description = 'Информация о событии'
  readonly access = 'ADMIN' as const

  readonly args = [
    {
      name: 'code',
      hint: 'код',
      prompt: '🔍 <b>Введите код события</b>',
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const code = args.code

    let reply: Awaited<ReturnType<typeof context.commandBus.send>>
    try {
      reply = await context.commandBus.send(
        'event.info',
        { code },
        context.session.user.recipientUuid,
      )
    } catch {
      await context.reply('Сервис временно недоступен.')
      return
    }

    if (!reply.ok) {
      await context.replyWithHTML(
        `🔍 <b>Событие с кодом <code>${escapeHtml(code)}</code> не найдено</b>`,
      )
      return
    }

    const { event } = reply.data as { event: SpotterEvent }
    const messagesCount = eventMessagesRepo.count(context.db, event.id)

    await context.replyWithHTML(
      `${renderEvent(event, context)}

🆔 <code>${event.id}</code>
💌 уведомлений: ${messagesCount} шт.`,
    )
  }
}

export const eventInfoCommand = new EventInfoCommand()
