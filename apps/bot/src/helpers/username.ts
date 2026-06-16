/** Normalizes a Telegram @username for storage/comparison (lowercase, no `@`). */
export const normalizeUsername = (value: string): string =>
  value.trim().replace(/^@/, '').toLowerCase()

/** Whether a user reference is a numeric Telegram id rather than an @username. */
export const isNumericId = (value: string): boolean =>
  /^\d+$/.test(value.trim())
