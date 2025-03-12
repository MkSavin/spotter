import dotenv from 'dotenv'

dotenv.config()

export const env = {
  string: (variable: string, defaultValue: string): string =>
    process.env[variable] ?? defaultValue,

  stringArray: (variable: string, defaultValue: string[] = []): string[] => {
    const value = process.env[variable] ?? undefined

    if (!value) {
      return defaultValue
    }

    return value.split(',')
  },

  number: (variable: string, defaultValue: number): number => {
    const value = process.env[variable] ?? undefined

    if (!value) {
      return defaultValue
    }

    const result = Number.parseInt(value, 10)

    return !Number.isNaN(result) ? result : defaultValue
  },
}
