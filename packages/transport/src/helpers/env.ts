/**
 * Reads a variable, dropping a trailing `# hint` an `.env` example carried in.
 * Both Bun's `--env-file` and compose's `env_file` already strip these, but a
 * value injected another way (compose `environment:`, a shell export, CI) is
 * passed through verbatim — and a stray hint silently becomes the value.
 *
 * Only for constrained values (enum/number/boolean/list), never for free-form
 * ones: a secret or URL may legitimately contain a hash.
 */
const readHinted = (variable: string): string | undefined => {
  const value = process.env[variable]
  if (value === undefined) return undefined

  const trimmed = value.replace(/\s+#.*$/s, '').trim()
  return trimmed === '' ? undefined : trimmed
}

export const env = {
  string: (variable: string, defaultValue: string): string =>
    process.env[variable] ?? defaultValue,

  stringArray: (
    variable: string,
    defaultValue: string[] = [],
    splitter = ',',
  ): string[] => {
    const value = readHinted(variable)

    if (!value) {
      return defaultValue
    }

    return value.split(splitter)
  },

  enum: <Values extends ReadonlyArray<Lowercase<string>>>(
    variable: string,
    values: Values,
    defaultValue: Values[number],
  ): Values[number] => {
    const value = readHinted(variable)

    if (!value) {
      return defaultValue
    }

    const normalized = value.toLowerCase() as Values[number]

    return values.includes(normalized) ? normalized : defaultValue
  },

  number: (variable: string, defaultValue: number): number => {
    const value = readHinted(variable)

    if (!value) {
      return defaultValue
    }

    const result = Number.parseInt(value, 10)

    return !Number.isNaN(result) ? result : defaultValue
  },

  boolean: (variable: string, defaultValue: boolean): boolean => {
    const value = readHinted(variable)

    if (!value) {
      return defaultValue
    }

    return value === 'true'
  },
}

/**
 * Fail-fast configuration guard. Pass a map of env-var name → already-resolved
 * value; every entry that resolved empty (`undefined` / `''` / `NaN`) is
 * aggregated into a single thrown error naming each missing variable, so boot
 * surfaces all the gaps at once instead of one `throw` per call site.
 */
export const requireConfig = (required: Record<string, unknown>): void => {
  const missing = Object.entries(required)
    .filter(
      ([, value]) =>
        value === undefined ||
        value === null ||
        value === '' ||
        (typeof value === 'number' && Number.isNaN(value)),
    )
    .map(([variable]) => variable)

  if (missing.length > 0) {
    throw new Error(
      `Invalid configuration. Missing required env: ${missing.join(', ')}`,
    )
  }
}
