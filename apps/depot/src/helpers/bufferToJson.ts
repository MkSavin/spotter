import { defaultLogger } from 'stenograph'

export const bufferToJson = <Result extends Record<string, any>>(
  value: Buffer | undefined | null,
): Result | null => {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value.toString())
  } catch (error) {
    defaultLogger.error(error)
  }

  return null
}
