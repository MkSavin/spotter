import { describe, expect, test } from 'bun:test'
import { formatMuteSpan, parseMuteMinutes } from './muteCommand'

describe('parseMuteMinutes', () => {
  test('accepts the presets', () => {
    expect(parseMuteMinutes('30m')).toBe(30)
    expect(parseMuteMinutes('8h')).toBe(480)
    expect(parseMuteMinutes('24h')).toBe(1440)
  })

  test('a bare number means minutes', () => {
    expect(parseMuteMinutes('45')).toBe(45)
  })

  test('accepts both alphabets for the hour suffix', () => {
    expect(parseMuteMinutes('3h')).toBe(180)
    expect(parseMuteMinutes('3ч')).toBe(180)
  })

  test('rejects nonsense and non-positive spans', () => {
    expect(parseMuteMinutes('soon')).toBeUndefined()
    expect(parseMuteMinutes('0')).toBeUndefined()
    expect(parseMuteMinutes('-5')).toBeUndefined()
  })

  test('refuses to mute beyond a week', () => {
    // Past this the user wants access revoked, not silence.
    expect(parseMuteMinutes('7d')).toBeUndefined()
    expect(parseMuteMinutes('200h')).toBeUndefined()
    expect(parseMuteMinutes('168h')).toBe(10_080)
  })
})

describe('formatMuteSpan', () => {
  test('reads back the way a person would say it', () => {
    expect(formatMuteSpan(30)).toBe('30 мин')
    expect(formatMuteSpan(120)).toBe('2 ч')
    expect(formatMuteSpan(90)).toBe('1 ч 30 мин')
  })
})
