// Telegram usernames are case-insensitive; we store and compare them normalized
// (lowercased, without the leading @).
export const normalizeUsername = (value: string): string =>
  value.trim().replace(/^@/, '').toLowerCase()

// A user reference is either a numeric Telegram id (#12345) or an @username.
export const isNumericId = (value: string): boolean =>
  /^\d+$/.test(value.trim())
