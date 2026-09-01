import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { deliveryStreams, mediaStreams } from '@spotter/transport'
import type { ServerContext } from '../../context'
import { createDatabase, type ServerDatabase } from '../../db/client'
import { eventsRepo } from '../../db/repository'
import { applicationLogger } from '../../log'
import { eventController } from './eventController'

beforeAll(() => {
  applicationLogger.disable()
})

type Published = { stream: string; payload: unknown }

const makeContext = (db: ServerDatabase, policy: 'all' | 'alerts' = 'all') => {
  const published: Published[] = []
  const context = {
    db,
    logger: applicationLogger,
    config: { delivery: { policy } },
    producer: {
      publish: async (stream: string, payload: unknown) => {
        published.push({ stream, payload })
        return '1-0'
      },
    },
  } as unknown as ServerContext

  return { context, published }
}

const frigateEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'cam-1700000000.1-abc',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: 1700000100,
  score: 0.9,
  stationary: false,
  hasClip: true,
  hasSnapshot: true,
  type: 'end',
  ...overrides,
})

const message = (event: Record<string, unknown>) => ({
  topic: 'spotter.event',
  message: { id: '1-0', value: JSON.stringify(event) },
})

describe('eventController media request', () => {
  let db: ServerDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('requests the snapshot even when hasSnapshot is false', async () => {
    const { context, published } = makeContext(db)

    await eventController(
      message(frigateEvent({ hasSnapshot: false })),
      context,
    )

    const request = published.find((entry) =>
      entry.stream.startsWith('spotter.media.request.'),
    )
    expect(request?.payload).toMatchObject({
      eventId: 'cam-1700000000.1-abc',
      want: ['snapshot'],
    })
  })

  test('still requests the snapshot when the flag is set', async () => {
    const { context, published } = makeContext(db)

    await eventController(message(frigateEvent()), context)

    expect(
      published.filter((entry) =>
        entry.stream.startsWith('spotter.media.request.'),
      ),
    ).toHaveLength(1)
  })

  test('asks for nothing before the event has ended', async () => {
    const { context, published } = makeContext(db)

    await eventController(
      message(frigateEvent({ type: 'update', endTime: null })),
      context,
    )

    expect(
      published.some((entry) =>
        entry.stream.startsWith('spotter.media.request.'),
      ),
    ).toBe(false)
    expect(published.map((entry) => entry.stream)).toContain(
      deliveryStreams.deliveryEvent,
    )
  })

  test('requests media on the per-source stream', async () => {
    const { context, published } = makeContext(db)

    await eventController(
      message(frigateEvent({ source: 'frigate-home' })),
      context,
    )

    expect(published.map((entry) => entry.stream)).toContain(
      mediaStreams.mediaRequest('frigate-home'),
    )
  })
})

describe('delivery policy', () => {
  let db: ServerDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('alerts-only drops what the NVR called a detection', async () => {
    const { context, published } = makeContext(db, 'alerts')
    await eventController(
      message(frigateEvent({ severity: 'detection' })),
      context,
    )

    expect(published).toHaveLength(0)
  })

  test('a filtered event is still persisted', async () => {
    const { context } = makeContext(db, 'alerts')
    const event = frigateEvent({ severity: 'detection' })
    await eventController(message(event), context)

    // The feed and /event_info must still find it: the policy governs
    // delivery, not history.
    expect(eventsRepo.find(db, event.id as string)).toBeDefined()
  })

  test('a filtered event does not make the NVR fetch a snapshot', async () => {
    const { context, published } = makeContext(db, 'alerts')
    await eventController(
      message(frigateEvent({ severity: 'detection' })),
      context,
    )

    expect(
      published.some((p) => p.stream.startsWith('spotter.media.request')),
    ).toBe(false)
  })

  test('an alert is delivered as usual', async () => {
    const { context, published } = makeContext(db, 'alerts')
    await eventController(message(frigateEvent({ severity: 'alert' })), context)

    expect(
      published.some((p) => p.stream === deliveryStreams.deliveryEvent),
    ).toBe(true)
  })

  test('an unclassified event survives alerts-only', async () => {
    // Frigate's review may simply not have landed yet; going quiet would be
    // worse than one extra notification.
    const { context, published } = makeContext(db, 'alerts')
    await eventController(message(frigateEvent()), context)

    expect(
      published.some((p) => p.stream === deliveryStreams.deliveryEvent),
    ).toBe(true)
  })

  test('the default policy delivers detections too', async () => {
    const { context, published } = makeContext(db, 'all')
    await eventController(
      message(frigateEvent({ severity: 'detection' })),
      context,
    )

    expect(
      published.some((p) => p.stream === deliveryStreams.deliveryEvent),
    ).toBe(true)
  })
})
