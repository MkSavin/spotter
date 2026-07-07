import { eventStreams } from '@spotter/transport'
import type { BotContext } from '../../context'
import { timeout } from '../../helpers/timeout'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class TestPublishCommand extends SpotterCommand {
  readonly name = 'test_publish'
  readonly description = 'Опубликовать тестовое событие'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.stringOptional
  protected readonly signature = 'test_publish [код?]'

  async handle(context: BotContext): Promise<void> {
    const { producer } = context

    const id =
      typeof context.match === 'string' && context.match.trim()
        ? context.match.trim()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const eventMessage = (type: 'start' | 'update' | 'end') => ({
      eventId: id,
      type,
    })

    const message = await context.replyWithHTML(
      `🏓 <b>Отправляем стартовое событие...</b> <code>${id}</code>`,
    )

    await producer.publish(eventStreams.testSeed, eventMessage('start'))
    await timeout(700)

    await message.editText(
      `🏓 <b>Отправляем обновляющее событие...</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )

    await producer.publish(eventStreams.testSeed, eventMessage('update'))
    await timeout(700)

    await message.editText(
      `🏓 <b>Отправляем оканчивающее событие...</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )

    await producer.publish(eventStreams.testSeed, eventMessage('end'))
    await timeout(700)

    await message.editText(
      `🏓 <b>Все тестовые события отправлены!</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )
  }
}

export const testPublishCommand = new TestPublishCommand()
