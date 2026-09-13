import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { MediaStaged } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import {
  type TranscodeJobRecord,
  TranscodeQueue,
  type TranscodeRunner,
} from './TranscodeQueue'

// Injected rather than module-mocked: `mock.module` is process-wide and would
// hand this stub to whatever test file runs next.
const run = mock() as unknown as TranscodeRunner & ReturnType<typeof mock>

const staged: MediaStaged = {
  eventId: 'cam-1700000000.123-abc',
  source: 'frigate',
  rawClipKey: 'staging/clip.mp4',
}

/** In-memory stand-in for the file-backed store. */
const makeStore = (seed: TranscodeJobRecord[] = []) => {
  const records = new Map(seed.map((record) => [record.jobId, record]))
  return {
    records,
    put: async (record: TranscodeJobRecord) => {
      records.set(record.jobId, record)
    },
    drop: async (jobId: string) => {
      records.delete(jobId)
    },
    list: async () => [...records.values()],
  }
}

const makeContext = () => {
  const published: Array<{ stream: string; payload: unknown }> = []
  return {
    published,
    context: {
      logger: defaultLogger,
      producer: {
        publish: async (stream: string, payload: unknown) => {
          published.push({ stream, payload })
          return '1-0'
        },
      },
    } as never,
  }
}

beforeEach(() => {
  run.mockReset()
})

describe('TranscodeQueue', () => {
  test('accept возвращается до конца транскодирования', async () => {
    // The whole point: the caller acks its stream entry while ffmpeg runs on.
    let finish = (): void => undefined
    run.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve(undefined))),
    )

    const { context } = makeContext()
    const queue = new TranscodeQueue({ context, store: makeStore(), run })

    await queue.accept(staged, defaultLogger)

    expect(queue.depth).toBe(1)
    finish()
  })

  test('задание попадает в хранилище до запуска и снимается после', async () => {
    run.mockImplementation(async () => ({
      eventId: staged.eventId,
      clipKey: 'event-media/clip.mp4',
    }))

    const store = makeStore()
    const { context, published } = makeContext()
    const queue = new TranscodeQueue({ context, store, run })

    await queue.accept(staged, defaultLogger)
    await queue.stop()

    expect(store.records.size).toBe(0)
    expect(published.at(-1)?.payload).toMatchObject({
      clipKey: 'event-media/clip.mp4',
    })
  })

  test('упавшее транскодирование остаётся в хранилище для следующего старта', async () => {
    // Nothing redelivers it: the stream entry was acked when it was accepted.
    run.mockImplementation(async () => {
      throw new Error('ffmpeg timed out')
    })

    const store = makeStore()
    const { context } = makeContext()
    const queue = new TranscodeQueue({ context, store, run })

    await queue.accept(staged, defaultLogger)
    await queue.stop()

    expect([...store.records.keys()]).toEqual([staged.eventId])
  })

  test('recover доводит до конца задания прошлого процесса', async () => {
    run.mockImplementation(async () => ({
      eventId: staged.eventId,
      clipKey: 'event-media/clip.mp4',
    }))

    const store = makeStore([
      { jobId: staged.eventId, staged, startedAt: Date.now() - 60_000 },
    ])
    const { context, published } = makeContext()
    const queue = new TranscodeQueue({ context, store, run })

    expect(await queue.recover(defaultLogger)).toBe(1)
    await queue.stop()

    expect(run).toHaveBeenCalledTimes(1)
    expect(published.at(-1)?.payload).toMatchObject({
      clipKey: 'event-media/clip.mp4',
    })
  })

  test('параллелизм ограничен настройкой', async () => {
    let running = 0
    let peak = 0
    const release: Array<() => void> = []
    run.mockImplementation(() => {
      running += 1
      peak = Math.max(peak, running)
      return new Promise((resolve) =>
        release.push(() => {
          running -= 1
          resolve(undefined)
        }),
      )
    })

    const { context } = makeContext()
    const queue = new TranscodeQueue({
      context,
      store: makeStore(),
      concurrency: 2,
      run,
    })

    for (const id of ['a', 'b', 'c', 'd']) {
      await queue.accept({ ...staged, eventId: id }, defaultLogger)
    }

    expect(peak).toBe(2)
    for (const done of [...release]) done()
  })
})
