import { eventStreams } from '@spotter/transport'
import type { BotContext } from '../../context'
import { timeout } from '../../helpers/timeout'
import { SpotterCommand } from '../framework/SpotterCommand'

class TestDeliveryCommand extends SpotterCommand {
  readonly name = 'test_delivery'
  readonly description = 'Проверить доставку сообщений (без медиа)'
  readonly access = 'ADMIN' as const

  readonly args = [
    {
      name: 'id',
      hint: 'id',
      optional: true,
      prompt: '🏓 <b>Введите id события</b>',
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const { producer } = context

    const id =
      args.id?.trim() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

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
      `🏓 <b>Все тестовые события отправлены!</b> <code>${id}</code>

<i>Событие синтетическое: в NVR его нет, поэтому кнопка «Видео» вернётся
в исходное состояние — брать клип неоткуда. Чтобы проверить медиа целиком,
выполни <code>/test_media</code>.</i>`,
      { parse_mode: 'HTML' },
    )
  }
}

export const testDeliveryCommand = new TestDeliveryCommand()
