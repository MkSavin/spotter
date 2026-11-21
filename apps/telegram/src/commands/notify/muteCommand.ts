import {
  formatMuteSpan,
  MUTE_PRESETS,
  parseMuteMinutes,
} from '@spotter/transport'
import type { BotContext } from '../../context'
import { tgChatsRepo } from '../../db/repository'
import { SpotterCommand } from '../framework/SpotterCommand'

export { formatMuteSpan, parseMuteMinutes } from '@spotter/transport'

class MuteCommand extends SpotterCommand {
  readonly name = 'mute'
  readonly description = 'Приглушить уведомления на время'
  readonly access = 'authorized' as const

  // Writes one local row; nothing reaches the NVR.
  protected readonly throttled = false

  readonly args = [
    {
      name: 'duration',
      hint: 'на сколько',
      prompt:
        '🔕 <b>Приглушить уведомления</b>\n\nВыберите срок или введите свой: <code>45</code> · <code>3ч</code>',
      choices: () =>
        MUTE_PRESETS.map((p) => ({ code: p.code, label: p.label })),
      allowManual: true,
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    if (!context.chatId) return

    const minutes = parseMuteMinutes(args.duration ?? '')
    if (!minutes) {
      await context.replyWithHTML(
        '⚠️ <b>Не понял срок</b>\n\nПримеры: <code>30</code> (минуты), <code>2ч</code>, <code>8h</code>. Максимум — неделя.',
      )
      return
    }

    const until = new Date(Date.now() + minutes * 60_000)
    tgChatsRepo.setMuted(context.db, context.chatId.toString(), until)

    const time = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: context.config.timezone,
    }).format(until)

    await context.replyWithHTML(
      `🔕 <b>Уведомления приглушены на ${formatMuteSpan(minutes)}</b>

Тишина до ${time}. Вернуть раньше — /unmute.
Приглушён только этот чат: другие получатели и каналы продолжают получать события.`,
    )
  }
}

export const muteCommand = new MuteCommand()
