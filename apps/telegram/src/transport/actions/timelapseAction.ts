import type { TimelapseFailure, TimelapseSpeed } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { formatSpan } from '../../timelapse/dateSpan'

export type TimelapseReadyPayload = {
  camera: string
  start: number
  end: number
  speed: TimelapseSpeed
  videoUrl: string
  chatId: string
  messageId?: number
}

export type TimelapseFailedPayload = {
  camera: string
  reason: TimelapseFailure
  chatId: string
  messageId?: number
}

const REASONS: Record<TimelapseFailure, string> = {
  empty: 'за этот период нет записей',
  rejected: 'NVR не смог собрать экспорт',
  timeout: 'экспорт не завершился вовремя',
}

/** Sends the finished timelapse, replacing the "собираем" placeholder. */
export const timelapseReadyAction = async (
  payload: TimelapseReadyPayload,
  context: TransportContext,
): Promise<void> => {
  const { bot, logger, config, catalog } = context
  const { camera, videoUrl, chatId, messageId } = payload

  const label = catalog.cameraLabel(config.source, camera)
  const span = formatSpan(
    { start: payload.start, end: payload.end },
    config.timezone,
  )
  const speed = payload.speed === 'realtime' ? 'реальное время' : 'ускоренно'

  const caption = `🎞 <b>Таймлапс</b> | ${label} | ${span} | ${speed}`

  try {
    await bot.api.sendVideo(chatId, videoUrl, {
      caption,
      parse_mode: 'HTML',
      supports_streaming: true,
    })

    // The placeholder has served its purpose; the video carries the caption.
    if (messageId) {
      await bot.api.deleteMessage(chatId, messageId).catch(() => undefined)
    }

    logger.verbose(`Timelapse sent to ${chatId}`)
  } catch (error) {
    logger.error('Could not send the timelapse', error)

    if (messageId) {
      await bot.api
        .editMessageText(
          chatId,
          messageId,
          '\u{26a0}\u{fe0f} <b>Таймлапс собран, но его не удалось отправить</b>',
          { parse_mode: 'HTML' },
        )
        .catch(() => undefined)
    }
  }
}

/** Reports that a timelapse will never arrive. */
export const timelapseFailedAction = async (
  payload: TimelapseFailedPayload,
  context: TransportContext,
): Promise<void> => {
  const { bot, logger, config, catalog } = context
  const { camera, reason, chatId, messageId } = payload

  const label = catalog.cameraLabel(config.source, camera)
  const text = `\u{26a0}\u{fe0f} <b>Таймлапс не собран</b> | ${label}\n\n${REASONS[reason]}`

  try {
    if (messageId) {
      await bot.api.editMessageText(chatId, messageId, text, {
        parse_mode: 'HTML',
      })
    } else {
      await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' })
    }
  } catch (error) {
    logger.error('Could not report the timelapse failure', error)
  }
}
