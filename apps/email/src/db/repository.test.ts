import { beforeEach, describe, expect, test } from 'bun:test'
import { createDatabase, type EmailDatabase } from './client'
import { notifiedEventsRepo } from './repository'

describe('email db repository', () => {
  let db: EmailDatabase

  beforeEach(() => {
    // Fresh in-memory database with migrations applied for each test.
    db = createDatabase(':memory:')
  })

  test('notifiedEvents.claim: first claim wins, redelivery is skipped', () => {
    // First delivery of an event: caller should send.
    expect(notifiedEventsRepo.claim(db, 'evt-1')).toBe(true)

    // Any later delivery of the same event (reclaim/retry): caller must skip.
    expect(notifiedEventsRepo.claim(db, 'evt-1')).toBe(false)
    expect(notifiedEventsRepo.claim(db, 'evt-1')).toBe(false)

    // A different event is independent.
    expect(notifiedEventsRepo.claim(db, 'evt-2')).toBe(true)
  })
})

describe('email dedup ledger retention', () => {
  let db: EmailDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('drops claims past the dedup window', () => {
    notifiedEventsRepo.claim(db, 'old')
    db.$client
      .query('UPDATE notified_events SET notified_at = ? WHERE event_id = ?')
      .run(Date.now() - 10 * 24 * 60 * 60 * 1000, 'old')
    notifiedEventsRepo.claim(db, 'recent')

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    expect(notifiedEventsRepo.prune(db, cutoff)).toBe(1)

    // The recent claim still blocks a redelivery; the pruned one no longer does.
    expect(notifiedEventsRepo.claim(db, 'recent')).toBe(false)
    expect(notifiedEventsRepo.claim(db, 'old')).toBe(true)
  })
})
