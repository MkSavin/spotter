import { Command } from '@grammyjs/commands'
import dayjs from 'dayjs'
import type { Message } from 'kafkajs'
import { Role } from '../../../../../.prisma-generated'
import type { BotContext } from '../../context'
import { timeout } from '../../helpers/timeout'
import { argument } from '../../middlewares/command/argument'
import { guard } from '../../middlewares/command/guard'
import { commandScopes } from '../commandScopes'

export const testPublishCommand = new Command<BotContext>(
  'test_publish',
  'Отправить тестовые данные в mqtt-канал',
).addToScope(commandScopes.private, [
  guard(Role.ADMIN),
  argument(argument.string, 'test_publish [код]'),
  async (context, next) => {
    const { producer } = context

    const id =
      context.match ||
      `${dayjs().unix()}-${Math.random().toString(36).slice(2)}`

    const eventMessage = (type: 'start' | 'update' | 'end'): Message => ({
      key: `event-test-${id}`,
      value: JSON.stringify({
        eventId: id,
        type,
      }),
    })

    const message = await context.replyWithHTML(
      `🏓 <b>Отправляем стартовое событие...</b> <code>${id}</code>`,
    )

    await producer.send({
      topic: 'spotter.event.test_seed',
      messages: [eventMessage('start')],
    })

    await timeout(700)

    await message.editText(
      `🏓 <b>Отправляем обновляющее событие...</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )

    await producer.send({
      topic: 'spotter.event.test_seed',
      messages: [eventMessage('update')],
    })

    await timeout(700)

    await message.editText(
      `🏓 <b>Отправляем оканчивающее событие...</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )

    await producer.send({
      topic: 'spotter.event.test_seed',
      messages: [eventMessage('end')],
    })

    await timeout(700)

    await message.editText(
      `🏓 <b>Все тестовые события отправлены!</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )

    return next()
  },
])
