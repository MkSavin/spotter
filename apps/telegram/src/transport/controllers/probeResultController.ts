import {
  bufferToJson,
  type StreamMessageController,
  safeParseProbeResult,
} from '@spotter/transport'
import type { TransportContext } from '../../context'

const refusal = (reason: string): string =>
  `🚫 <b>Тест не запущен</b>\n\n${reason}`

const staged = (camera: string, frames: number): string =>
  `🎬 <b>NVR показали объект</b> на камере <b>${camera}</b> (${frames} кадров).

Дальше он сам: увидит, отследит, запишет клип и опубликует событие. Сообщение придёт обычным путём.

<i>Если ничего не пришло за пару минут — сломано что-то настоящее, и это ровно то, что тест ищет.</i>`

export const probeResultController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const result = safeParseProbeResult(value)
  if (!result) return

  // Without a chat to answer, the outcome is still worth a log line: an
  // unanswered refusal is what makes `/test` look like the outage it detects.
  if (result.chatId === undefined) {
    context.logger.warn(
      result.staged
        ? `Probe staged on ${result.camera}, but nobody asked`
        : `Probe refused: ${result.reason}`,
    )
    return
  }

  const text = result.staged
    ? staged(result.camera ?? '—', result.frames ?? 0)
    : refusal(result.reason ?? 'Причина неизвестна.')

  await context.bot.api.sendMessage(result.chatId, text, {
    parse_mode: 'HTML',
  })
}
