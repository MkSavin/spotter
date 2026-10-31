import { open } from 'node:fs/promises'

export type DownloadOptions = {
  /** How long the body may go without a byte before the transfer is resumed. */
  stallMs?: number
  /** How many broken transfers are resumed before giving up. */
  attempts?: number
  /** Pause before a resume; doubles each time, capped at 15 s. */
  backoffMs?: number
  fetch?: typeof fetch
}

/** A status that says the file is there but the attempt was not: worth a resume. */
const transient = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500

/** Hands over a stream chunk, or fails when the body goes silent for too long. */
const readWithin = async <T>(
  pending: Promise<T>,
  stallMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no data for ${stallMs}ms`)),
      stallMs,
    )
  })
  try {
    return await Promise.race([pending, stalled])
  } finally {
    clearTimeout(timer)
  }
}

const total = (response: Response, offset: number): number | undefined => {
  const range = response.headers.get('content-range')?.split('/')[1]
  if (range) return Number(range)
  const length = response.headers.get('content-length')
  return length ? offset + Number(length) : undefined
}

/**
 * Downloads a URL into a file, resuming a broken transfer from the byte it
 * stopped at. Progress is judged by silence, not duration: a large clip over a
 * slow link may take as long as it takes, as long as bytes keep arriving.
 * Returns the file's size.
 */
export const downloadToFile = async (
  url: string,
  destination: string,
  options: DownloadOptions = {},
): Promise<number> => {
  const { stallMs = 30_000, attempts = 10, backoffMs = 1_000 } = options
  const fetchFn = options.fetch ?? fetch

  const handle = await open(destination, 'w')
  let offset = 0
  let expected: number | undefined
  let failures = 0

  const retry = async (error: unknown): Promise<void> => {
    failures += 1
    if (failures > attempts) throw error
    await Bun.sleep(Math.min(backoffMs * 2 ** (failures - 1), 15_000))
  }

  try {
    for (;;) {
      // The connect and the headers can hang as well as the body; the guard
      // lets go once the body is streaming, which has its own.
      const aborter = new AbortController()
      let response: Response
      try {
        response = await readWithin(
          fetchFn(url, {
            headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
            signal: aborter.signal,
          }),
          stallMs,
        )
      } catch (error) {
        aborter.abort()
        await retry(error)
        continue
      }

      if (response.status === 206) {
        expected = total(response, offset)
      } else if (response.ok) {
        // The server ignored the range: what is on disk is not a prefix of
        // what is coming now.
        if (offset > 0) {
          await handle.truncate(0)
          offset = 0
        }
        expected = total(response, 0)
      } else if (response.status === 416 && expected === offset) {
        // Already whole: nothing left to ask for.
        break
      } else {
        await response.body?.cancel()
        const error = new Error(
          `Cannot retrieve media: HTTP ${response.status}`,
        )
        if (!transient(response.status)) throw error
        await retry(error)
        continue
      }

      const reader = response.body?.getReader()
      if (!reader) break

      try {
        for (;;) {
          const { value, done } = await readWithin(reader.read(), stallMs)
          if (done) break
          await handle.write(value, 0, value.byteLength, offset)
          offset += value.byteLength
        }
        if (expected !== undefined && offset < expected) {
          throw new Error(`body ended at ${offset} of ${expected} bytes`)
        }
        break
      } catch (error) {
        await reader.cancel().catch(() => undefined)
        await retry(error)
      }
    }
  } finally {
    await handle.close()
  }

  return offset
}
