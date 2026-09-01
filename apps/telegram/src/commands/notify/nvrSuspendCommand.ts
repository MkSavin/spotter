import { notificationStreams } from '@spotter/transport'
import type { BotContext } from '../../context'
import { escapeHtml } from '../../helpers/html'
import { SpotterCommand } from '../framework/SpotterCommand'
import { parseMuteMinutes } from './muteCommand'

/** Stands for every camera the source knows. */
const ALL_CAMERAS = 'all'

class NvrSuspendCommand extends SpotterCommand {
  readonly name = 'nvr_suspend'
  readonly description = 'Приглушить уведомления самого NVR (для всех)'
  readonly access = 'ADMIN' as const

  readonly args = [
    {
      name: 'camera',
      hint: 'камера',
      prompt: '🔇 <b>Какую камеру приглушить в NVR?</b>',
      choices: (context: BotContext) => [
        { code: ALL_CAMERAS, label: 'все камеры' },
        ...context.catalog.cameras(context.config.source),
      ],
      emptyPrompt:
        '🔇 <b>Список камер пока недоступен</b> — NVR ещё не отдал каталог.\n\nВведите имя камеры вручную или <code>all</code>.',
      allowManual: true,
    },
    {
      name: 'duration',
      hint: 'на сколько',
      prompt:
        '⏱ <b>На какой срок?</b>\n\nВыберите или введите своё: <code>45</code> · <code>3ч</code>\n<code>0</code> — снять приглушение',
      choices: () => [
        { code: '30m', label: '30 минут' },
        { code: '2h', label: '2 часа' },
        { code: '8h', label: 'до утра (8 ч)' },
        { code: '0', label: 'снять приглушение' },
      ],
      allowManual: true,
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const camera = args.camera?.trim().toLowerCase()
    if (!camera) return

    const raw = args.duration?.trim() ?? ''
    // `0` is the documented way to lift a suspension, so it bypasses the parser
    // that deliberately rejects a zero-length mute.
    const minutes = raw === '0' ? 0 : parseMuteMinutes(raw)

    if (minutes === undefined) {
      await context.replyWithHTML(
        '⚠️ <b>Не понял срок</b>\n\nПримеры: <code>30</code> (минуты), <code>2ч</code>, <code>0</code> — снять.',
      )
      return
    }

    const source = context.config.source
    const cameras = context.catalog.cameras(source)

    if (
      camera !== ALL_CAMERAS &&
      cameras.length > 0 &&
      !cameras.some((entry) => entry.code === camera)
    ) {
      await context.replyWithHTML(
        `⚠️ <b>Камера <code>${escapeHtml(camera)}</code> не найдена</b>`,
      )
      return
    }

    await context.producer.publish(notificationStreams.suspend(source), {
      source,
      camera,
      minutes,
    })

    const scope =
      camera === ALL_CAMERAS
        ? 'всех камер'
        : context.catalog.cameraLabel(source, camera)

    await context.replyWithHTML(
      minutes > 0
        ? `🔇 <b>NVR приглушён для ${scope} на ${minutes} мин</b>

Это глобально: события не придут никому и ни в один канал.`
        : `🔊 <b>Приглушение NVR снято для ${scope}</b>`,
    )
  }
}

export const nvrSuspendCommand = new NvrSuspendCommand()
