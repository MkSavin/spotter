import { beforeEach, describe, expect, test } from 'bun:test'
import {
  CatalogCache,
  type DeliveryEvent,
  type SpotterEvent,
} from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import type { TransportContext } from '../../context'
import { createDatabase } from '../../db/client'
import { notifiedEventsRepo, recentEventsRepo } from '../../db/repository'
import { PushCoalescer } from '../../push/Coalescer'
import { pushEventAction } from './pushEventAction'

const event: SpotterEvent = {
  id: 'cam-1700000000.123-abc',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: null,
  score: 0.9,
  stationary: false,
  hasClip: false,
  hasSnapshot: true,
  type: 'start',
}

const delivery = (action: DeliveryEvent['action']): DeliveryEvent => ({
  eventId: event.id,
  event,
  action,
})

const makeContext = () => {
  const db = createDatabase(':memory:')
  const sent: unknown[] = []
  const push = {
    send: async (_t: unknown, payload: unknown) => {
      sent.push(payload)
      return { ok: true as const }
    },
  }
  // One stored subscription so the fan-out has a target.
  db.$client.run(
    "INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ('https://p/1','p','a')",
  )

  const context = {
    config: { source: 'frigate', timezone: 'Europe/Moscow', coalesceMs: 50 },
    logger: defaultLogger.sub('test'),
    db,
    catalog: new CatalogCache(defaultLogger.sub('cat')),
    coalescer: new PushCoalescer({ db, push: push as never, coalesceMs: 50 }),
  } as unknown as TransportContext

  return { context, db, sent }
}

describe('pushEventAction', () => {
  let ctx: ReturnType<typeof makeContext>

  beforeEach(() => {
    ctx = makeContext()
  })

  test('create pushes once and caches the event', async () => {
    await pushEventAction(delivery('create'), ctx.context)

    expect(ctx.sent).toHaveLength(1)
    expect(recentEventsRepo.get(ctx.db, event.id)).toBeDefined()
    expect(notifiedEventsRepo.claim(ctx.db, event.id)).toBe(false)
  })

  test('redelivery of create does not push again', async () => {
    await pushEventAction(delivery('create'), ctx.context)
    await pushEventAction(delivery('create'), ctx.context)

    expect(ctx.sent).toHaveLength(1)
  })

  test('update caches but never pushes', async () => {
    await pushEventAction(delivery('update'), ctx.context)

    expect(ctx.sent).toHaveLength(0)
    expect(recentEventsRepo.get(ctx.db, event.id)).toBeDefined()
  })
})
