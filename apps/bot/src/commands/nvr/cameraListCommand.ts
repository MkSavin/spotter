import type { BotContext } from '../../context'
import { SpotterCommand } from '../framework/SpotterCommand'

class CameraListCommand extends SpotterCommand {
  readonly name = 'camera_list'
  readonly description = 'Получить список камер'
  readonly access = 'USER' as const

  async handle(context: BotContext): Promise<void> {
    const list = Object.entries(context.config.cameraLabels || {})
      .map(([code, label]) => `- <b>${label}</b> [<code>${code}</code>]`)
      .join('\n')

    await context.replyWithHTML(`📷 <b>Список доступных камер:</b>\n\n${list}`)
  }
}

export const cameraListCommand = new CameraListCommand()
