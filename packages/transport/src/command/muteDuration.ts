/** Preset durations, so the common case is one tap rather than typing. */
export const MUTE_PRESETS: { code: string; label: string; minutes: number }[] =
  [
    { code: '30m', label: '30 минут', minutes: 30 },
    { code: '2h', label: '2 часа', minutes: 120 },
    { code: '8h', label: 'до утра (8 ч)', minutes: 480 },
    { code: '24h', label: 'сутки', minutes: 1440 },
  ]

/** Parses a preset code or a bare minute count. */
export const parseMuteMinutes = (raw: string): number | undefined => {
  const value = raw.trim().toLowerCase()

  const preset = MUTE_PRESETS.find((p) => p.code === value)
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
