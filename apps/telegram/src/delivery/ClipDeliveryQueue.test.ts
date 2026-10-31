import { describe, expect, mock, test } from 'bun:test'
import type { DeliveryEvent, JobStore } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import type { TransportContext } from '../context'
import { ClipDeliveryQueue, type ClipDeliveryRecord } from './ClipDeliveryQueue'

defaultLogger.disable()

const delivery = (eventId = 'cam-1'): DeliveryEvent => ({
  eventId,
  action: 'media',
  clipKey: 'event-media/clip.mp4',
  clipBytes: 300_000_000,
  event: {
    id: eventId,
    camera: 'front',
    label: 'person',
    startTime: 1,
    endTime: 2,
    score: 0.9,
    stationary: false,
    hasClip: true,
    hasSnapshot: false,
    type: 'end',
  },
})

const context = { logger: defaultLogger } as unknown as TransportContext

/** In memory, with the same surface the file store has. */
const memoryStore = (): JobStore<ClipDeliveryRecord> & {
  records: Map<string, ClipDeliveryRecord>
} => {
  const records = new Map<string, ClipDeliveryRecord>()
  return {
    records,
    put: (record) => {
      records.set(record.jobId, record)
    },
    drop: (jobId) => {
      records.delete(jobId)
    },
    list: () => [...records.values()],
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('ClipDeliveryQueue', () => {
  test('accept returns before the delivery runs, and the record outlives it', async () => {
    const store = memoryStore()
    let release = () => undefined as void
    const run = mock(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const queue = new ClipDeliveryQueue(defaultLogger, { store, run })

    await queue.accept(delivery(), context)

    // Recorded and running, while the stream entry is already acked.
    expect(store.records.has('cam-1')).toBe(true)
    expect(queue.depth).toBe(1)
    release()
    await settled()
    expect(store.records.has('cam-1')).toBe(false)
    expect(queue.depth).toBe(0)
  })

  test('a redelivery of the same event while it runs is ignored', async () => {
    let release = () => undefined as void
    const run = mock(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const queue = new ClipDeliveryQueue(defaultLogger, { run })

    await queue.accept(delivery(), context)
    await queue.accept(delivery(), context)
    release()
    await settled()

    expect(run).toHaveBeenCalledTimes(1)
  })

  test('deliveries run one at a time, in order', async () => {
    const order: string[] = []
    const run = mock(async (d: DeliveryEvent) => {
      order.push(`start ${d.eventId}`)
      await settled()
      order.push(`end ${d.eventId}`)
    })
    const queue = new ClipDeliveryQueue(defaultLogger, { run })

    await queue.accept(delivery('a'), context)
    await queue.accept(delivery('b'), context)
    await settled()
    await settled()
    await settled()

    expect(order).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  test('a failed delivery is rerun, then given up on and dropped', async () => {
    const store = memoryStore()
    const run = mock(async () => {
      throw new Error('400: Bad Request')
    })
    const queue = new ClipDeliveryQueue(defaultLogger, {
      store,
      run,
      attempts: 2,
      backoffMs: 1,
    })

    await queue.accept(delivery(), context)
    await settled()

    expect(run).toHaveBeenCalledTimes(2)
    // Nothing left to resume on the next start: the attempts were spent.
    expect(store.records.size).toBe(0)
  })

  test('recover resumes what a previous process never finished', async () => {
    const store = memoryStore()
    store.put({
      jobId: 'cam-9',
      delivery: delivery('cam-9'),
      acceptedAt: 1,
      attempts: 0,
    })
    const run = mock(async () => undefined)
    const queue = new ClipDeliveryQueue(defaultLogger, { store, run })

    expect(await queue.recover(context)).toBe(1)
    await settled()

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'cam-9' }),
      expect.anything(),
    )
    expect(store.records.size).toBe(0)
  })
})
