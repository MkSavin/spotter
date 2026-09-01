import type { BotContext } from '../../context'
import { timelapseWaitsRepo } from '../../db/repository'
import { formatSpan } from '../../timelapse/dateSpan'
import { formatElapsed } from '../../transport/actions/timelapseAction'
import { SpotterCommand } from '../framework/SpotterCommand'

class TimelapseStatusCommand extends SpotterCommand {
  readonly name = 'timelapse_status'
  readonly description = 'Что сейчас собирается'
  readonly access = 'USER' as const

  // Reads local state only; nothing reaches the NVR.
  protected readonly throttled = false

  async handle(context: BotContext): Promise<void> {
    if (!context.chatId) return

    const waits = timelapseWaitsRepo.list(context.db, String(context.chatId))

    if (waits.length === 0) {
      await context.replyWithHTML(
        '🎞 <b>Нет запущенных таймлапсов</b>\n\nЗапустить — /timelapse',
      )
      return
    }

    const lines = waits.map((wait) => {
      const label = context.catalog.cameraLabel(
        context.config.source,
        wait.camera,
      )
      const span = formatSpan(
        { start: wait.start, end: wait.end },
        context.config.timezone,
      )
      // No `startedAt` means no progress tick has landed yet: the request is
      // out but the NVR has not confirmed it took the job.
      const state = wait.startedAt
        ? `⏱ собирается ${formatElapsed(Date.now() - wait.startedAt.getTime())}`
        : '⏳ в очереди'

      return `<b>${label}</b> | ${span}\n${state}`
    })

    await context.replyWithHTML(
      `🎞 <b>Таймлапсы в работе</b>\n\n${lines.join('\n\n')}\n\n<i>Длинные периоды собираются часами — сообщение с запросом обновляется само.</i>`,
    )
  }
}

export const timelapseStatusCommand = new TimelapseStatusCommand()
