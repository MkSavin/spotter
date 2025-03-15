import { Command } from '@grammyjs/commands'
import { $Enums } from '@prisma/client'
import type { BotContext } from '../../context'
import { Frigate, frigateMedia } from '../../framework/api/Frigate'
import { get } from '../../helpers/get'
import { argument } from '../../middlewares/command/argument'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'
import type { Message } from 'kafkajs'

export const snapshotCommand = new Command<BotContext>(
  'snapshot',
  'Получить последний кадр с камеры',
).addToScope(commandScopes.private, [
  guard($Enums.Role.ADMIN),
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
      const response = await context.frigate.get(frigateMedia.camera.latest, {
        camera: cameraName,
      })

      if (response.status !== 200) {
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
          endpointAuthorization: Frigate.generateJWT(),
        }),
      }

      await producer.send({
        topic: 'spotter.camera.frame_requested',
        messages: [eventMessage],
      })

      await message.editText('🖼 <b>Обрабатываем полученный снимок...</b>', {
        parse_mode: 'HTML',
      })
    } catch {
      await message.editText(
        '\u{26a0}\u{fe0f} <b>Ошибка при обработке снимка...</b>',
        {
          parse_mode: 'HTML',
        },
      )
    }

    return next()
  },
])
