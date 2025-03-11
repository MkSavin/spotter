import { Command } from '@grammyjs/commands'
import { $Enums } from '@prisma/client'
import dayjs from 'dayjs'
import { InputFile } from 'grammy'
import type { Context } from '../../context'
import { frigateMedia } from '../../framework/api/Frigate'
import { get } from '../../helpers/get'
import { processSnapshot } from '../../media/processing/processMedia'
import { argument } from '../../middlewares/command/argument'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const snapshotCommand = new Command<Context>(
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

    const camera = get(
      context.content.cameraLabels,
      context.match.trim().toLowerCase(),
      cameraName,
    )

    const message = await context.replyWithHTML(
      `🖼 <b>Получаем снимок с камеры ${camera}...</b>`,
    )

    await context.replyWithChatAction('upload_photo')

    try {
      const image = await context.frigate.get(frigateMedia.camera.latest, {
        camera: cameraName,
      })

      if (image.status !== 200) {
        await message.editText(
          '\u{26a0}\u{fe0f} <b>Ошибка при получении снимка...</b>',
          {
            parse_mode: 'HTML',
          },
        )

        return next()
      }

      const buffer = await image.arrayBuffer()

      await message.editText('🖼 <b>Обрабатываем полученный снимок...</b>', {
        parse_mode: 'HTML',
      })

      const processedBuffer = await processSnapshot(buffer)

      await message.editMedia({
        type: 'photo',
        media: new InputFile(processedBuffer),
        caption: `<b>Снимок с камеры</b> | 📆 ${dayjs().format('DD.MM HH:mm')} | ${camera}`,
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
