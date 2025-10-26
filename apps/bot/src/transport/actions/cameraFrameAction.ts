import type { TransportContext } from '../../context'
import { InnoxiousMediaGroup } from '../../extension/innoxious/InnoxiousMedia'
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

  const formattedDate = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date())

  const media = new InnoxiousMediaGroup([
    {
      type: 'photo' as const,
      media: frameUrl,
      caption: `<b>Снимок с камеры</b> | 📆 ${formattedDate} | ${cameraLabel}`,
      parse_mode: 'HTML' as const,
    },
  ])

  let tryIndex = 0

  if (tryIndex < 3) {
    try {
      const snapshot = (await media.naive()).at(0)

      if (snapshot) {
        if (messageId) {
          await bot.api.editMessageMedia(chatId, messageId, snapshot)
        } else {
          await bot.api.sendPhoto(chatId, snapshot.media, {
            caption: snapshot.caption,
            parse_mode: snapshot.parse_mode,
          })
        }
        logger.verbose(`Media sent to ${chatId}`)
        tryIndex = 0
      }
    } catch (error) {
      logger.error('Error while publishing media by public strategy', error)
      tryIndex++
    }
  }

  if (tryIndex !== 0) {
    logger.debug('Retrying with buffered strategy')

    try {
      const snapshot = (await media.accurate()).at(0)

      if (snapshot) {
        if (messageId) {
          await bot.api.editMessageMedia(chatId, messageId, snapshot)
        } else {
          await bot.api.sendPhoto(chatId, snapshot.media, {
            caption: snapshot.caption,
            parse_mode: snapshot.parse_mode,
          })
        }

        logger.verbose(`Media sent to ${chatId}`)
      }
    } catch (error) {
      logger.error('Error while publishing media by buffered strategy', error)

      if (messageId) {
        await bot.api.editMessageText(
          chatId,
          messageId,
          'При обработке снимка что-то пошло не так...',
          {
            parse_mode: 'HTML' as const,
          },
        )
      }
    }
  }

  logger.debug('Camera frame successfully sent')
}
