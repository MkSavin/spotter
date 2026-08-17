/**
 * A failure that is worth another delivery: S3 hiccups, an object the stager
 * has not made visible yet, a killed encode. Actions let these escape so the
 * regulator leaves the entry pending and the reaper retries it; every other
 * error is final and gets acked with a `failed` progress report.
 */
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

/**
 * Captures an outcome instead of rejecting, so sibling media can be processed
 * in parallel and the caller can still tell transient from permanent failure.
 */
export const settle = async <T>(
  operation: () => Promise<T>,
): Promise<Outcome<T>> => {
  try {
    return { value: await operation() }
  } catch (error) {
    return { error }
  }
}
