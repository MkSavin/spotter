import type { BotContext } from '../../context'
import { SpotterCommand } from '../framework/SpotterCommand'

class CameraListCommand extends SpotterCommand {
  readonly name = 'camera_list'
  readonly description = 'Получить список камер'
  readonly access = 'USER' as const

  // Reads local state only; nothing reaches the NVR.
  protected readonly throttled = false

  async handle(context: BotContext): Promise<void> {
    const cameras = context.catalog.cameras(context.config.source)

    if (cameras.length === 0) {
      await context.replyWithHTML('📷 <b>Список камер пока недоступен</b>')
      return
    }

    const list = cameras
      .map(({ code, label }) => `- <b>${label}</b> [<code>${code}</code>]`)
      .join('\n')

    await context.replyWithHTML(`📷 <b>Список доступных камер:</b>\n\n${list}`)
  }
}

export const cameraListCommand = new CameraListCommand()
