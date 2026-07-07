const SECRET_KEY_PATTERN = /secret|token|password|access|jwt|credential/i

const REDACTED = '***'

/**
 * Deep-copies a config object with secret-looking leaf values masked, so a
 * config dump (e.g. `logger.verbose('config', ...)`) never leaks tokens, S3
 * secrets or NVR credentials into logs. Key names are matched, not values.
 */
export const redactConfig = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => redactConfig(item)) as T
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, val]) =>
        SECRET_KEY_PATTERN.test(key) && val !== undefined && val !== ''
          ? [key, REDACTED]
          : [key, redactConfig(val)],
    )
    return Object.fromEntries(entries) as T
  }

  return value
}
