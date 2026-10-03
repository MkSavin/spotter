import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { S3File } from 'bun'
import { download, exists, PART_SIZE, upload } from './s3Transfer'
import { TransientError } from './TransientError'

const directory = mkdtempSync(path.join(tmpdir(), 'spotter-transfer-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

const STALL_MS = 40

/** Chunks arriving `gapMs` apart; `stallAfter` chunks, then silence. */
const objectStreaming = (
  chunks: number,
  gapMs: number,
  stallAfter = Number.POSITIVE_INFINITY,
) =>
  ({
    stream: () => {
      let sent = 0
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (sent >= stallAfter) return new Promise(() => undefined)
          if (sent >= chunks) return controller.close()
          await Bun.sleep(gapMs)
          controller.enqueue(new Uint8Array(1024).fill(sent))
          sent += 1
        },
      })
    },
  }) as unknown as S3File

/** A writer whose part uploads take `flushMs` each, or never finish. */
const objectAccepting = (flushMs: number | 'never') => {
  const parts: number[] = []
  let pending = 0
  const settle = (): Promise<number> =>
    flushMs === 'never'
      ? new Promise(() => undefined)
      : Bun.sleep(flushMs).then(() => {
          parts.push(pending)
          pending = 0
          return 0
        })
  return {
    parts,
    object: {
      writer: () => ({
        write: (chunk: Uint8Array) => {
          pending += chunk.byteLength
          return chunk.byteLength
        },
        flush: settle,
        end: (error?: Error) => (error ? 0 : settle()),
      }),
    } as unknown as S3File,
  }
}

describe('download', () => {
  test('streams the object to disk and reports its size', async () => {
    const target = Bun.file(path.join(directory, 'whole.bin'))

    expect(await download(objectStreaming(8, 0), target, STALL_MS)).toBe(8192)
    expect(target.size).toBe(8192)
  })

  test('a slow transfer that keeps moving is never cut', async () => {
    // Ten chunks, each just inside the window: far longer than the window in
    // total, which is exactly the long clip on a slow link.
    const target = Bun.file(path.join(directory, 'slow.bin'))

    expect(await download(objectStreaming(10, 25), target, STALL_MS)).toBe(
      10 * 1024,
    )
  })

  test('a transfer that goes silent fails as retryable', async () => {
    const target = Bun.file(path.join(directory, 'stalled.bin'))

    const error = await download(objectStreaming(10, 0, 3), target, STALL_MS)
      .then(() => undefined)
      .catch((caught: Error) => caught)

    expect(error).toBeInstanceOf(TransientError)
    expect(error?.message).toBe(`s3 get: no progress for ${STALL_MS}ms`)
  })
})

describe('upload', () => {
  const source = async (bytes: number) => {
    const file = Bun.file(path.join(directory, `source-${bytes}.bin`))
    await Bun.write(file, new Uint8Array(bytes))
    return file
  }

  test('sends part by part, every part but the last at least the S3 minimum', async () => {
    const { object, parts } = objectAccepting(0)
    const bytes = PART_SIZE * 2 + 10

    await upload(await source(bytes), object, 'video/mp4', 1000)

    expect(parts.length).toBeGreaterThan(1)
    expect(parts.slice(0, -1).every((size) => size >= PART_SIZE)).toBe(true)
    expect(parts.reduce((sum, size) => sum + size, 0)).toBe(bytes)
  })

  test('a slow upload that keeps moving is never cut', async () => {
    const { object } = objectAccepting(25)

    await upload(await source(PART_SIZE * 3), object, 'video/mp4', STALL_MS)
  })

  test('a part that never finishes fails as retryable', async () => {
    const { object } = objectAccepting('never')

    const error = await upload(
      await source(PART_SIZE + 1),
      object,
      'video/mp4',
      STALL_MS,
    )
      .then(() => undefined)
      .catch((caught: Error) => caught)

    expect(error).toBeInstanceOf(TransientError)
    expect(error?.message).toBe(`s3 put: no progress for ${STALL_MS}ms`)
  })
})

describe('exists', () => {
  test('a head request that never answers fails as retryable', async () => {
    const object = {
      exists: () => new Promise(() => undefined),
    } as unknown as S3File

    const error = await exists(object, STALL_MS).catch(
      (caught: Error) => caught,
    )

    expect(error).toBeInstanceOf(TransientError)
  })
})
