export const bufferToJson = <Result extends Record<string, any>>(
  value: Buffer | string | undefined | null,
): Result | null => (value ? JSON.parse(value.toString()) : null)
