import dotenv from 'dotenv'

dotenv.config()

export const env = {
  string: (variable: string, defaultValue: string): string =>
    process.env[variable] ?? defaultValue,

  stringArray: (
    variable: string,
    defaultValue: string[] = [],
    splitter = ',',
  ): string[] => {
    const value = process.env[variable] ?? undefined

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
    const value = process.env[variable] ?? undefined

    if (!value) {
      return defaultValue
    }

    const normalized = value.trim().toLowerCase() as Values[number]

    return values.includes(normalized) ? normalized : defaultValue
  },

  number: (variable: string, defaultValue: number): number => {
    const value = process.env[variable] ?? undefined

    if (!value) {
      return defaultValue
    }

    const result = Number.parseInt(value, 10)

    return !Number.isNaN(result) ? result : defaultValue
  },

  boolean: (variable: string, defaultValue: boolean): boolean => {
    const value = process.env[variable] ?? undefined

    if (!value) {
      return defaultValue
    }

    return value === 'true'
  },
}
