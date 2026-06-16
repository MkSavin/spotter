export const normalizeUsername = (value: string): string =>
  value.trim().replace(/^@/, '').toLowerCase()

export const isNumericId = (value: string): boolean =>
  /^\d+$/.test(value.trim())
