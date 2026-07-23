import { beforeEach, describe, expect, test } from 'bun:test'
import { type EmailDatabase, createDatabase } from './client'
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
