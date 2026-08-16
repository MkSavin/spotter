import { eventStreams } from '@spotter/transport'
import type { BotContext } from '../../context'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

/** Seconds of footage Frigate records for the manual event. */
const DURATION = 10

class TestMediaCommand extends SpotterCommand {
  readonly name = 'test_media'
  readonly description = 'Сквозной тест: настоящее событие в NVR'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.stringOptional
  protected readonly signature = 'test_media [камера?]'

  async handle(context: BotContext): Promise<void> {
    const { producer, config } = context

    const cameras = context.catalog.cameras(config.source)
    const requested =
      typeof context.match === 'string' && context.match.trim()
        ? context.match.trim()
        : undefined

    if (cameras.length === 0) {
      await context.replyWithHTML(
        '📷 <b>Список камер недоступен</b> — сначала проверь связь с NVR.',
      )
      return
    }

    const camera = requested
      ? cameras.find((entry) => entry.code === requested)
      : cameras[0]

    if (!camera) {
      const list = cameras.map(({ code }) => `<code>${code}</code>`).join(', ')
      await context.replyWithHTML(
        `📷 <b>Нет такой камеры.</b> Доступны: ${list}`,
      )
      return
    }

    await context.replyWithHTML(
      `🎬 <b>Прошу NVR записать ${DURATION} секунд</b> с камеры <b>${camera.label}</b>.

Событие настоящее, поэтому клип действительно появится — это проверяет всю
цепочку целиком. Сообщение придёт само, примерно через полминуты.`,
    )

    await producer.publish(eventStreams.testSeed, {
      mode: 'real',
      camera: camera.code,
      label: 'person',
      duration: DURATION,
    })
  }
}

export const testMediaCommand = new TestMediaCommand()
