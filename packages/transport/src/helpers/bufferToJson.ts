export const bufferToJson = <Result extends Record<string, any>>(
  value: Buffer | undefined | null,
): Result | null => (value ? JSON.parse(value.toString()) : null)
