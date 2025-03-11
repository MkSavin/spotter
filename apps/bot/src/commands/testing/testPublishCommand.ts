import { Command } from '@grammyjs/commands'
import { $Enums } from '@prisma/client'
import dayjs from 'dayjs'
import type { Context } from '../../context'
import messageEnd from '../../data/message-end.json'
import messageStart from '../../data/message-start.json'
import { timeout } from '../../helpers/timeout'
import { argument } from '../../middlewares/command/argument'
import { guard } from '../../middlewares/command/guard'
import { commandScopes } from '../commandScopes'

export const testPublishCommand = new Command<Context>(
  'test_publish',
  'Отправить тестовые данные в mqtt-канал',
).addToScope(commandScopes.private, [
  guard($Enums.Role.ADMIN),
  argument(argument.string, 'test_publish [код]'),
  async (context, next) => {
    const unix = dayjs().unix()

    const id =
      typeof context.match === 'string'
        ? context.match
        : `${unix}-${Math.random().toString(36).slice(2)}`

    const start_time = unix
    const end_time = unix + 3 * 60 + 32

    const messages = {
      start: {
        ...messageStart,
        before: { ...messageStart.before, id, start_time },
        after: { ...messageStart.after, id, start_time },
      },
      end: {
        ...messageEnd,
        before: { ...messageEnd.before, id, start_time, end_time },
        after: { ...messageEnd.after, id, start_time, end_time },
      },
    }

    const publish = (message: any) =>
      new Promise<void>((resolve, reject) =>
        context.mqtt.publish(
          'frigate/events',
          JSON.stringify(message),
          {
            qos: 2,
            retain: false,
          },
          (error) => {
            if (error) {
              reject(error)
              return
            }

            resolve()
          },
        ),
      )

    const message = await context.replyWithHTML(
      `🏓 <b>Отправляем стартовое событие...</b> <code>${id}</code>`,
    )

    await publish(messages.start)

    await timeout(1500)

    await message.editText(
      `🏓 <b>Отправляем оканчивающее событие...</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )

    await publish(messages.end)

    await message.editText(
      `🏓 <b>Все тестовые события отправлены!</b> <code>${id}</code>`,
      { parse_mode: 'HTML' },
    )

    return next()
  },
])
