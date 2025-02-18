import dayjs from 'dayjs'
import {
  Command,
  type CommandExecutionContext,
} from '../framework/commands/Command'
import { resolveLatestFrame } from '../mediaResolve'

export class SnapshotCommand extends Command {
  signature = 'snapshot'
  description = 'Получить актуальный снимок с камеры'
  regexp = /\/(?:snapshot|shot) (\w+)/g

  async authorize(context: CommandExecutionContext): Promise<boolean> {
    return !!context.authorizedUser
  }

  async testArguments(context: CommandExecutionContext): Promise<boolean> {
    const { match } = context
    return !!match?.at(1)
  }

  async execute(context: CommandExecutionContext): Promise<void> {
    const { bot, chatId, api, match } = context

    // validate input
    const camera = match?.at(1)?.trim()

    if (!camera) {
      this.logger.debug('Camera name is not valid')
      await bot.sendMessage(chatId, 'Указано неверное название камеры')
      return
    }

    const snapshotRequest = api.get(resolveLatestFrame(camera))

    const formattedDateTime = dayjs().format('DD.MM.YYYY HH:mm:ss')

    await bot.sendPhoto(
      chatId,
      snapshotRequest,
      {
        caption: `<b>Снимок с камеры</b>\n📆 <code>${formattedDateTime}</code> | 📹 <i>${camera}</i>\n`,
        parse_mode: 'HTML',
      },
      {
        filename: `snapshot-${camera}-latest.jpg`,
      },
    )
  }
}
