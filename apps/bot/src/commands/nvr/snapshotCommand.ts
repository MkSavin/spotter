import { Command } from '@grammyjs/commands'
import type { Message } from 'kafkajs'
import { Role } from '../../../../../.prisma-generated'
import type { BotContext } from '../../context'
import { ResourceType } from '../../endpoint/Resource'
import { get } from '../../helpers/get'
import { argument } from '../../middlewares/command/argument'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const snapshotCommand = new Command<BotContext>(
  'snapshot',
  'Получить последний кадр с камеры',
).addToScope(commandScopes.private, [
  guard(Role.ADMIN),
  sender('present'),
  argument(argument.string, 'snapshot [камера]'),
  async (context, next) => {
    if (typeof context.match !== 'string') {
      return next()
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
        {
          camera: cameraName,
        },
      )

      const response = await context.nvr.fetchRequest(request)

      if (!response.ok) {
        context.logger.warn('Snapshot response is not ok, skipping...')

        await message.editText(
          '\u{26a0}\u{fe0f} <b>Ошибка при получении снимка...</b>',
          {
            parse_mode: 'HTML',
          },
        )

        return next()
      }

      const { producer } = context

      const eventMessage: Message = {
        value: JSON.stringify({
          cameraCode: cameraName,
          chatId: context.chatId,
          messageId: message?.message_id,
          frameUrl: response.url,
          endpointAuthorization: request.headers.get('Authorization'),
        }),
      }

      await producer.send({
        topic: 'spotter.camera.frame_requested',
        messages: [eventMessage],
      })

      await message.editText(
        `🖼 <b>Обрабатываем снимок с камеры ${cameraLabel}...</b>`,
        {
          parse_mode: 'HTML',
        },
      )
    } catch (error) {
      await message.editText(
        '\u{26a0}\u{fe0f} <b>Ошибка при обработке снимка...</b>',
        {
          parse_mode: 'HTML',
        },
      )

      context.logger.error(error)
    }

    return next()
  },
])
