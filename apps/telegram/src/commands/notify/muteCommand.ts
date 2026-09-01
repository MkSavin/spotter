import type { BotContext } from '../../context'
import { tgChatsRepo } from '../../db/repository'
import { SpotterCommand } from '../framework/SpotterCommand'

/** Preset durations, so the common case is one tap rather than typing. */
const PRESETS: { code: string; label: string; minutes: number }[] = [
  { code: '30m', label: '30 минут', minutes: 30 },
  { code: '2h', label: '2 часа', minutes: 120 },
  { code: '8h', label: 'до утра (8 ч)', minutes: 480 },
  { code: '24h', label: 'сутки', minutes: 1440 },
]

/** Parses a preset code or a bare minute count. */
export const parseMuteMinutes = (raw: string): number | undefined => {
  const value = raw.trim().toLowerCase()

  const preset = PRESETS.find((p) => p.code === value)
  if (preset) return preset.minutes

  const suffixed = value.match(/^(\d+)\s*([mмhч])?$/)
  if (!suffixed) return undefined

  const amount = Number(suffixed[1])
  if (amount <= 0) return undefined

  const hours = suffixed[2] === 'h' || suffixed[2] === 'ч'
  const minutes = hours ? amount * 60 : amount

  // A week is already far beyond "step out for a bit"; past that the user
  // wants their access revoked, not muted.
  return minutes <= 7 * 24 * 60 ? minutes : undefined
}

/** `1 ч 30 мин` — how long the silence will last, for the confirmation. */
export const formatMuteSpan = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours > 0 ? `${hours} ч` : '', rest > 0 ? `${rest} мин` : '']
    .filter(Boolean)
    .join(' ')
}

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
      choices: () => PRESETS.map((p) => ({ code: p.code, label: p.label })),
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
