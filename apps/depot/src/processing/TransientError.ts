/** A failure worth another delivery (S3 hiccup, key not visible yet). */
export class TransientError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'TransientError'
  }
}

/** Runs an S3 (or other I/O) step, re-tagging any failure as retryable. */
export const transient = async <T>(
  what: string,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw new TransientError(`${what}: ${(error as Error)?.message}`, error)
  }
}

export type Outcome<T> = { value?: T; error?: unknown }

/** Captures the outcome so a sibling's failure does not cancel the other. */
export const settle = async <T>(
  operation: () => Promise<T>,
): Promise<Outcome<T>> => {
  try {
    return { value: await operation() }
  } catch (error) {
    return { error }
  }
}
