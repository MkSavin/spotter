import type { BunFile, S3File } from 'bun'
import { TransientError } from './TransientError'

/** The smallest part S3 accepts; each one is a step the stall window covers. */
export const PART_SIZE = 5 * 1024 * 1024

const retryable = (what: string, error: unknown): TransientError =>
  error instanceof TransientError
    ? error
    : new TransientError(`${what}: ${(error as Error)?.message}`, error)

/**
 * Fails a step that stays silent for `stallMs`. Bounds silence, not duration:
 * a slow transfer that keeps moving is never cut, however long it takes.
 */
const within = async <T>(
  what: string,
  stallMs: number,
  step: T | Promise<T>,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(step),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new TransientError(`${what}: no progress for ${stallMs}ms`)),
          stallMs,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export const exists = async (
  object: S3File,
  stallMs: number,
): Promise<boolean> => {
  try {
    return await within('s3 head', stallMs, object.exists())
  } catch (error) {
    throw retryable('s3 head', error)
  }
}

/** Streams an object to disk, never holding it in memory; returns its size. */
export const download = async (
  object: S3File,
  target: BunFile,
  stallMs: number,
): Promise<number> => {
  const reader = object.stream().getReader()
  const sink = target.writer()
  let bytes = 0

  try {
    for (;;) {
      const { done, value } = await within('s3 get', stallMs, reader.read())
      if (done) break
      sink.write(value)
      bytes += value.byteLength
    }
    return bytes
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    throw retryable('s3 get', error)
  } finally {
    await sink.end()
  }
}

/**
 * Uploads part by part: the writer buffers whatever it is given and reports
 * nothing until `flush()`, so each part is flushed and awaited on its own.
 */
export const upload = async (
  source: BunFile,
  object: S3File,
  type: string,
  stallMs: number,
): Promise<void> => {
  const writer = object.writer({ type, partSize: PART_SIZE, queueSize: 1 })
  const reader = source.stream().getReader()
  let buffered = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      writer.write(value)
      buffered += value.byteLength
      if (buffered >= PART_SIZE) {
        await within('s3 put', stallMs, writer.flush())
        buffered = 0
      }
    }
    await within('s3 put', stallMs, writer.end())
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    // Abandons the multipart upload rather than leaving it open.
    void Promise.resolve(writer.end(error as Error)).catch(() => undefined)
    throw retryable('s3 put', error)
  }
}
