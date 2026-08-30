import { type CameraRequest, mediaStreams } from '@spotter/transport'
import type { BotContext } from '../../context'
import { escapeHtml } from '../../helpers/html'
import { SpotterCommand } from '../framework/SpotterCommand'

class CameraSnapshotCommand extends SpotterCommand {
  readonly name = 'camera_snapshot'
  readonly description = 'Получить последний кадр с камеры'
  readonly access = 'USER' as const

  readonly args = [
    {
      name: 'camera',
      hint: 'камера',
      prompt: '📷 <b>Выберите камеру</b>',
      // Read at prompt time so a refreshed catalog is reflected immediately.
      choices: (context: BotContext) =>
        context.catalog.cameras(context.config.source),
      emptyPrompt:
        '📷 <b>Список камер пока недоступен</b> — NVR ещё не отдал каталог.\n\nВведите имя камеры вручную.',
      allowManual: true,
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const cameraName = args.camera?.trim().toLowerCase()
    if (!cameraName) return

    const source = context.config.source
    const cameras = context.catalog.cameras(source)
    const known = cameras.map((e) => `<code>${e.code}</code>`).join(', ')

    if (cameras.length > 0 && !cameras.some((e) => e.code === cameraName)) {
      await context.replyWithHTML(
        `\u{26a0}\u{fe0f} <b>Камера <code>${escapeHtml(cameraName)}</code> не найдена</b>${
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
