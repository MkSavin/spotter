import dayjs from 'dayjs'
import type { TransportContext } from '../../context'
import { get } from '../../helpers/get'

export type CameraFramePayload = {
  cameraCode: string
  frameUrl: string
  chatId: string
  messageId?: number
}

export const cameraFrameAction = async (
  payload: CameraFramePayload,
  context: TransportContext,
): Promise<void> => {
  const { logger, bot, config } = context
  const { cameraCode, frameUrl, chatId, messageId } = payload

  logger.debug('Received camera frame')

  const cameraLabel = get(config.cameraLabels, cameraCode, cameraCode)

  const media = {
    type: 'photo' as const,
    media: frameUrl,
    caption: `<b>Снимок с камеры</b> | 📆 ${dayjs().format('DD.MM HH:mm')} | ${cameraLabel}`,
    parse_mode: 'HTML' as const,
  }

  if (messageId) {
    await bot.api.editMessageMedia(chatId, messageId, media)
  } else {
    await bot.api.sendPhoto(chatId, media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
    })
  }

  logger.debug('Camera frame successfully sent')
}
