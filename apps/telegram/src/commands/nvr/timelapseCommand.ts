import {
  type TimelapseRequest,
  type TimelapseSpeed,
  timelapseStreams,
} from '@spotter/transport'
import type { BotContext } from '../../context'
import { escapeHtml } from '../../helpers/html'
import { formatSpan, parseDateSpan, quickSpans } from '../../timelapse/dateSpan'
import { SpotterCommand } from '../framework/SpotterCommand'

/**
 * Frigate exposes exactly two playback factors on the export API. What
 * `timelapse` actually compresses to is set by `record.export.timelapse_args`
 * in the NVR's own config, so the label speaks of "ускоренно" rather than
 * promising a multiplier this side cannot know.
 */
const SPEEDS: Array<{ code: TimelapseSpeed; label: string }> = [
  { code: 'timelapse', label: '⏩ Ускоренно' },
  { code: 'realtime', label: '▶️ Реальное время' },
]

class TimelapseCommand extends SpotterCommand {
  readonly name = 'timelapse'
  readonly description = 'Собрать таймлапс за период'
  readonly access = 'USER' as const

  readonly args = [
    {
      name: 'camera',
      hint: 'камера',
      prompt: '🎞 <b>Выберите камеру</b>',
      // Read at prompt time so a refreshed catalog is reflected immediately.
      choices: (context: BotContext) =>
        context.catalog.cameras(context.config.source),
      emptyPrompt:
        '🎞 <b>Список камер пока недоступен</b> — NVR ещё не отдал каталог.\n\nВведите имя камеры вручную.',
      allowManual: true,
    },
    {
      name: 'span',
      hint: 'период',
      prompt:
        '📆 <b>За какой период?</b>\n\nВыберите готовый или введите свой:\n<code>15.08</code> · <code>15.08 09:00-18:00</code> · <code>28.08 09:00 - 31.08 22:00</code>',
      // Buttons for the common periods; anything else is typed.
      choices: (context: BotContext) => quickSpans(context.config.timezone),
      allowManual: true,
      parse: (raw: string, context: BotContext) => {
        const span = parseDateSpan(raw, context.config.timezone)
        return span
          ? // Re-serialized rather than passed through: the handler must not
            // parse the same text a second time and risk a different answer.
            { status: 'done' as const, value: `${span.start}-${span.end}` }
          : {
              status: 'retry' as const,
              error:
                'Не понял период. Попробуйте <code>сегодня</code> или <code>15.08 09:00-18:00</code>',
            }
      },
    },
    {
      name: 'speed',
      hint: 'скорость',
      prompt: '⏱ <b>Выберите скорость</b>',
      choices: () => SPEEDS.map(({ code, label }) => ({ code, label })),
      // Without this the engine has no text handler for the step and silently
      // drops anything typed there — the dialog just looks frozen.
      allowManual: true,
      parse: (raw: string) => {
        const value = raw.trim().toLowerCase()
        const found = SPEEDS.find((speed) => speed.code === value)
        return found
          ? { status: 'done' as const, value: found.code }
          : { status: 'retry' as const, error: 'Неизвестная скорость' }
      },
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const camera = args.camera?.trim().toLowerCase()
    if (!camera) return

    const source = context.config.source
    const cameras = context.catalog.cameras(source)

    if (cameras.length > 0 && !cameras.some((entry) => entry.code === camera)) {
      const known = cameras.map((e) => `<code>${e.code}</code>`).join(', ')
      await context.replyWithHTML(
        `\u{26a0}\u{fe0f} <b>Камера <code>${escapeHtml(camera)}</code> не найдена</b>${
          known ? `\n\nДоступны: ${known}` : ''
        }`,
      )
      return
    }

    const span = this.resolveSpan(args.span, context)

    if (!span) {
      await context.replyWithHTML(
        '\u{26a0}\u{fe0f} <b>Не понял период</b>\n\nНапример: <code>сегодня</code> или <code>15.08 09:00-18:00</code>',
      )
      return
    }

    const speed: TimelapseSpeed =
      args.speed === 'realtime' ? 'realtime' : 'timelapse'
    const label = context.catalog.cameraLabel(source, camera)

    const message = await context.replyWithHTML(
      `🎞 <b>Собираем таймлапс</b> | ${label} | ${formatSpan(span, context.config.timezone)}\n\n<i>Это займёт несколько минут — пришлём, как будет готово.</i>`,
    )

    try {
      const request: TimelapseRequest = {
        source,
        camera,
        start: span.start,
        end: span.end,
        speed,
        chatId: context.chatId,
        messageId: message?.message_id,
      }

      await context.producer.publish(timelapseStreams.request(source), request)
    } catch (error) {
      await message.editText(
        '\u{26a0}\u{fe0f} <b>Не удалось поставить таймлапс в очередь</b>',
        { parse_mode: 'HTML' },
      )
      context.logger.error(error)
    }
  }

  /**
   * The dialog hands back the span it already parsed; an inline invocation
   * (`/timelapse front сегодня`) still arrives as raw text.
   */
  private resolveSpan(
    raw: string | undefined,
    context: BotContext,
  ): { start: number; end: number } | null {
    if (!raw) return null

    const encoded = /^(\d+)-(\d+)$/.exec(raw.trim())

    if (encoded) {
      const start = Number(encoded[1])
      const end = Number(encoded[2])
      return end > start ? { start, end } : null
    }

    return parseDateSpan(raw, context.config.timezone)
  }
}

export const timelapseCommand = new TimelapseCommand()
