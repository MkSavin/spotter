import { afterEach, describe, expect, test } from 'bun:test'
import type { TimelapseRequest } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import type { TimelapseProgress, TimelapseProvider } from './TimelapseProvider'
import {
  type TimelapseJobRecord,
  type TimelapseStore,
  TimelapseTracker,
} from './TimelapseTracker'

defaultLogger.disable()

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const request: TimelapseRequest = {
  source: 'frigate',
  camera: 'front',
  start: 1_700_000_000,
  end: 1_700_003_600,
  speed: 'timelapse',
  chatId: 42,
  messageId: 7,
}

const makeHarness = (provider: Partial<TimelapseProvider>) => {
  const published: Array<{ stream: string; payload: any }> = []
  const records = new Map<string, TimelapseJobRecord>()

  const store: TimelapseStore = {
    put: (record) => {
      records.set(record.jobId, record)
    },
    drop: (jobId) => {
      records.delete(jobId)
    },
    list: () => [...records.values()],
  }

  const tracker = new TimelapseTracker({
    provider: {
      startExport: async () => ({ id: 'front_abc123' }),
      pollExport: async () => ({ state: 'running' }) as TimelapseProgress,
      discardExport: async () => {},
      ...provider,
    },
    producer: {
      publish: async (stream: string, payload: unknown) => {
        published.push({ stream, payload })
        return '1-0'
      },
    } as never,
    s3: {
      file: () => ({ write: async () => {} }),
    } as never,
    stagingPrefix: 'staging',
    sourceId: 'frigate',
    logger: defaultLogger,
    store,
    pollIntervalMs: 1,
  })

  return { tracker, published, records, store }
}

describe('TimelapseTracker', () => {
  test('reports failure when the NVR declines the export', async () => {
    const { tracker, published } = makeHarness({
      startExport: async () => null,
    })

    await tracker.start(request, defaultLogger)

    expect(published).toHaveLength(1)
    expect(published[0]?.stream).toBe('spotter.timelapse.failed')
    expect(published[0]?.payload.reason).toBe('rejected')
    // The correlation ids must survive, or the message never gets updated.
    expect(published[0]?.payload.chatId).toBe(42)
  })

  test('a started export is remembered so a restart can resume it', async () => {
    const { tracker, records } = makeHarness({})

    await tracker.start(request, defaultLogger)
    tracker.stop()

    expect([...records.keys()]).toEqual(['front_abc123'])
  })

  test('stages the video and publishes ready once the export finishes', async () => {
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as never

    let discarded = ''

    const { tracker, published, records } = makeHarness({
      pollExport: async () => ({
        state: 'ready',
        fetch: new Request('https://nvr/exports/a.mp4'),
      }),
      discardExport: async (id) => {
        discarded = id
      },
    })

    await tracker.start(request, defaultLogger)
    await Bun.sleep(30)
    tracker.stop()

    const ready = published.find(
      (entry) => entry.stream === 'spotter.timelapse.ready',
    )

    expect(ready).toBeDefined()
    expect(ready?.payload.videoKey).toBe(
      'staging/frigate/timelapse-front_abc123.mp4',
    )
    expect(ready?.payload.chatId).toBe(42)
    // Delivered means done: neither the NVR copy nor the record should linger.
    expect(discarded).toBe('front_abc123')
    expect(records.size).toBe(0)
  })

  test('an export the NVR forgot is reported instead of polled forever', async () => {
    const { tracker, published, records } = makeHarness({
      pollExport: async () => ({ state: 'lost' }),
    })

    await tracker.start(request, defaultLogger)
    await Bun.sleep(30)
    tracker.stop()

    expect(
      published.some((entry) => entry.stream === 'spotter.timelapse.failed'),
    ).toBe(true)
    expect(records.size).toBe(0)
  })

  test('keeps polling when a poll throws: the NVR may just be restarting', async () => {
    let calls = 0

    const { tracker, published } = makeHarness({
      pollExport: async () => {
        calls += 1
        if (calls < 3) throw new Error('connection refused')
        return { state: 'lost' }
      },
    })

    await tracker.start(request, defaultLogger)
    await Bun.sleep(40)
    tracker.stop()

    expect(calls).toBeGreaterThanOrEqual(3)
    expect(
      published.some((entry) => entry.stream === 'spotter.timelapse.failed'),
    ).toBe(true)
  })

  test('recover resumes a stored export', async () => {
    const { tracker, records, published } = makeHarness({
      pollExport: async () => ({ state: 'lost' }),
    })

    records.set('front_old', {
      jobId: 'front_old',
      request,
      startedAt: Date.now(),
    })

    expect(await tracker.recover(defaultLogger)).toBe(1)
    await Bun.sleep(30)
    tracker.stop()

    expect(
      published.some((entry) => entry.stream === 'spotter.timelapse.failed'),
    ).toBe(true)
  })

  test('recover gives up when the NVR has forgotten the export', async () => {
    const { tracker, records, published } = makeHarness({
      pollExport: async () => ({ state: 'lost' }) as TimelapseProgress,
    })

    records.set('front_stale', {
      jobId: 'front_stale',
      request,
      startedAt: Date.now() - 13 * 60 * 60 * 1000,
    })

    await tracker.recover(defaultLogger)
    tracker.stop()

    expect(published[0]?.payload.reason).toBe('timeout')
    expect(records.size).toBe(0)
  })

  test('recover keeps an overdue export the NVR is still working on', async () => {
    // The bug this guards: a restart used to fail a long export instantly,
    // purely on the clock, while the NVR was still writing the file.
    const { tracker, records, published } = makeHarness({
      pollExport: async () => ({ state: 'running' }) as TimelapseProgress,
    })

    records.set('front_slow', {
      jobId: 'front_slow',
      request,
      startedAt: Date.now() - 13 * 60 * 60 * 1000,
    })

    await tracker.recover(defaultLogger)
    tracker.stop()

    expect(published.some((p) => p.payload?.reason === 'timeout')).toBe(false)
    expect(records.size).toBe(1)
  })

  test('an unreachable NVR is not taken as proof the export died', async () => {
    const { tracker, records, published } = makeHarness({
      pollExport: async () => {
        throw new Error('NVR restarting')
      },
    })

    records.set('front_slow', {
      jobId: 'front_slow',
      request,
      startedAt: Date.now() - 13 * 60 * 60 * 1000,
    })

    await tracker.recover(defaultLogger)
    tracker.stop()

    expect(published.some((p) => p.payload?.reason === 'timeout')).toBe(false)
    expect(records.size).toBe(1)
  })

  test('a running export reports progress so a long wait looks alive', async () => {
    const { tracker, published } = makeHarness({
      pollExport: async () => ({ state: 'running' }) as TimelapseProgress,
    })

    await tracker.start(request, defaultLogger)
    await Bun.sleep(30)
    tracker.stop()

    const progress = published.find((p) =>
      p.stream.endsWith('timelapse.progress'),
    )
    expect(progress).toBeDefined()
    expect(progress?.payload.camera).toBe('front')
    expect(progress?.payload.startedAt).toBeGreaterThan(0)
  })
})
