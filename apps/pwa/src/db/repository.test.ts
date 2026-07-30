import { beforeEach, describe, expect, test } from 'bun:test'
import { type PwaDatabase, createDatabase } from './client'
import {
  notifiedEventsRepo,
  recentEventsRepo,
  subscriptionsRepo,
} from './repository'

const keys = (endpoint: string) => ({
  endpoint,
  p256dh: 'p',
  auth: 'a',
})

describe('pwa db repository', () => {
  let db: PwaDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('notifiedEvents.claim: first wins, redelivery skipped, release re-arms', () => {
    expect(notifiedEventsRepo.claim(db, 'evt-1')).toBe(true)
    expect(notifiedEventsRepo.claim(db, 'evt-1')).toBe(false)

    notifiedEventsRepo.release(db, 'evt-1')
    expect(notifiedEventsRepo.claim(db, 'evt-1')).toBe(true)
  })

  test('subscriptions.upsert is idempotent by endpoint and refreshes keys', () => {
    subscriptionsRepo.upsert(db, keys('https://push/1'), 'phone')
    const again = subscriptionsRepo.upsert(
      db,
      { ...keys('https://push/1'), auth: 'a2' },
      'phone',
    )

    expect(subscriptionsRepo.list(db)).toHaveLength(1)
    expect(again.auth).toBe('a2')
  })

  test('subscriptions.bindRecipient authorizes a device', () => {
    subscriptionsRepo.upsert(db, keys('https://push/1'))
    subscriptionsRepo.bindRecipient(db, 'https://push/1', 'rcpt-1')

    expect(
      subscriptionsRepo.findByEndpoint(db, 'https://push/1')?.recipientUuid,
    ).toBe('rcpt-1')
  })

  test('recentEvents.save keeps only the newest rows within the limit', () => {
    for (let i = 0; i < 5; i += 1) {
      recentEventsRepo.save(db, `evt-${i}`, { n: i }, 3)
    }

    const rows = recentEventsRepo.list(db, 10)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.eventId)).toContain('evt-4')
    expect(rows.map((r) => r.eventId)).not.toContain('evt-0')
  })
})
