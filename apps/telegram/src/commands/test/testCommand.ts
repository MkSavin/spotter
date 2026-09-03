import { probeStreams } from '@spotter/transport'
import type { BotContext } from '../../context'
import { SpotterCommand } from '../framework/SpotterCommand'

/** Frames of detection, at ~5fps roughly six seconds of a visible object. */
const FRAMES = 30

class TestCommand extends SpotterCommand {
  readonly name = 'test'
  readonly description = 'Сквозной тест: NVR сам порождает событие'
  readonly access = 'ADMIN' as const

  readonly args = [
    {
      name: 'camera',
      hint: 'камера',
      optional: true,
      prompt: '📷 <b>Выберите камеру</b>',
      choices: (context: BotContext) =>
        context.catalog.cameras(context.config.source),
      allowManual: true,
    },
    {
      name: 'label',
      hint: 'объект',
      optional: true,
      prompt: '🧍 <b>Что показать NVR?</b>',
      choices: (context: BotContext) =>
        context.catalog.objectTypes(context.config.source),
      allowManual: true,
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const { producer, config } = context

    const cameras = context.catalog.cameras(config.source)
    const requested = args.camera?.trim() || undefined

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

    const label = args.label?.trim() || 'person'

    // No promise of an event here: the adapter answers separately, and it may
    // well answer "refused". Claiming success before the adapter has spoken is
    // how a broken test looks identical to a broken NVR.
    await context.replyWithHTML(
      `🎬 <b>Просим NVR увидеть «${label}»</b> на камере <b>${camera.label}</b>…`,
    )

    await producer.publish(probeStreams.request(config.source), {
      source: config.source,
      camera: camera.code,
      label,
      frames: FRAMES,
      score: 0.9,
      chatId: context.chat?.id,
    })
  }
}

export const testCommand = new TestCommand()
