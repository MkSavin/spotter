import { type CameraRequest, mediaStreams } from '@spotter/transport'
import type { BotContext } from '../../context'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class CameraSnapshotCommand extends SpotterCommand {
  readonly name = 'camera_snapshot'
  readonly description = 'Получить последний кадр с камеры'
  readonly access = 'USER' as const

  protected readonly matcher = argument.string
  protected readonly signature = 'camera_snapshot [камера]'

  async handle(context: BotContext): Promise<void> {
    if (typeof context.match !== 'string') {
      return
    }

    const cameraName = context.match.trim().toLowerCase()
    const source = context.config.source

    const cameras = context.catalog.cameras(source)

    // If the catalog is loaded, reject unknown cameras early; if it is not
    // available yet, optimistically forward the request to the adapter.
    if (
      cameras.length > 0 &&
      !cameras.some((entry) => entry.code === cameraName)
    ) {
      await context.replyWithHTML(
        `\u{26a0}\u{fe0f} <b>Камера <code>${cameraName}</code> не найдена</b>`,
      )
      return
    }

    const cameraLabel = context.catalog.cameraLabel(source, cameraName)

    const message = await context.replyWithHTML(
      `🖼 <b>Получаем снимок с камеры ${cameraLabel}...</b>`,
    )

    await context.replyWithChatAction('upload_photo')

    try {
      const request: CameraRequest = {
        source,
        camera: cameraName,
        chatId: context.chatId,
        messageId: message?.message_id,
      }

      await context.producer.publish(
        mediaStreams.cameraRequest(source),
        request,
      )
    } catch (error) {
      await message.editText(
        '\u{26a0}\u{fe0f} <b>Ошибка при обработке снимка...</b>',
        { parse_mode: 'HTML' },
      )

      context.logger.error(error)
    }
  }
}

export const cameraSnapshotCommand = new CameraSnapshotCommand()
