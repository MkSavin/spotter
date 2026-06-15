import type { BotContext } from '../../context'
import { ResourceType } from '../../endpoint/Resource'
import { get } from '../../helpers/get'
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
    const cameraLabel = get(context.config.cameraLabels, cameraName, cameraName)

    const message = await context.replyWithHTML(
      `🖼 <b>Получаем снимок с камеры ${cameraLabel}...</b>`,
    )

    await context.replyWithChatAction('upload_photo')

    try {
      const request = context.nvr.composeResourceRequest(
        ResourceType.latestFrame,
        { camera: cameraName },
      )

      const response = await context.nvr.fetchRequest(request)

      if (!response.ok) {
        context.logger.warn('Snapshot response is not ok, skipping...')

        await message.editText(
          '\u{26a0}\u{fe0f} <b>Ошибка при получении снимка...</b>',
          { parse_mode: 'HTML' },
        )

        return
      }

      const { producer } = context

      await producer.publish('spotter.camera.frame_requested', {
        cameraCode: cameraName,
        chatId: context.chatId,
        messageId: message?.message_id,
        frameUrl: response.url,
        endpointAuthorization: request.headers.get('Authorization'),
      })

      await message.editText(
        `🖼 <b>Обрабатываем снимок с камеры ${cameraLabel}...</b>`,
        { parse_mode: 'HTML' },
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
