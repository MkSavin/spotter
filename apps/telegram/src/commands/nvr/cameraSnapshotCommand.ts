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
    if (typeof context.match !== 'string') return

    const cameraName = context.match.trim().toLowerCase()
    const source = context.config.source

    const cameras = context.catalog.cameras(source)
    const known = cameras.map((e) => `<code>${e.code}</code>`).join(', ')

    // Without a name there is nothing to look up; list what is available.
    if (!cameraName) {
      await context.replyWithHTML(
        `\u{26a0}\u{fe0f} <b>Укажи камеру:</b> <code>/camera_snapshot front</code>${
          known ? `\n\nДоступны: ${known}` : ''
        }`,
      )
      return
    }

    if (cameras.length > 0 && !cameras.some((e) => e.code === cameraName)) {
      await context.replyWithHTML(
        `\u{26a0}\u{fe0f} <b>Камера <code>${cameraName}</code> не найдена</b>${
          known ? `\n\nДоступны: ${known}` : ''
        }`,
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
