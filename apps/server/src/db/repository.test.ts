import { beforeEach, describe, expect, test } from 'bun:test'
import type { SpotterEvent } from '@spotter/transport'
import { createDatabase, type ServerDatabase } from './client'
import { eventsRepo, recipientsRepo, tokensRepo } from './repository'

const makeEvent = (overrides: Partial<SpotterEvent> = {}): SpotterEvent => ({
  id: 'cam-1700000000.123-abc',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: null,
  score: 0.9,
  stationary: false,
  hasClip: false,
  hasSnapshot: false,
  type: 'start',
  ...overrides,
})

describe('server db repository', () => {
  let db: ServerDatabase

  beforeEach(() => {
    // Fresh in-memory database with migrations applied for each test.
    db = createDatabase(':memory:')
  })

  test('recipients: upsertByTgUserId / find / setRole / remove', () => {
    recipientsRepo.upsertByTgUserId(db, {
      uuid: 'r1',
      tgUserId: '12345',
      username: 'alice',
      role: 'VIEWER',
    })
    // same tg_user_id updates the existing row (unique constraint)
    const updated = recipientsRepo.upsertByTgUserId(db, {
      uuid: 'r2',
      tgUserId: '12345',
      username: 'alice',
      role: 'USER',
    })

    expect(updated.uuid).toBe('r1')
    expect(updated.role).toBe('USER')
    expect(recipientsRepo.count(db)).toBe(1)

    // by numeric id
    expect(recipientsRepo.findByTgUserId(db, '12345')?.uuid).toBe('r1')
    // by @username, case-insensitive, leading @ tolerated
    expect(recipientsRepo.findByRef(db, '@Alice')?.uuid).toBe('r1')
    expect(recipientsRepo.findByRef(db, 'nobody')).toBeUndefined()

    const promoted = recipientsRepo.setRole(db, 'r1', 'ADMIN')
    expect(promoted?.role).toBe('ADMIN')

    const removed = recipientsRepo.remove(db, 'r1')
    expect(removed?.uuid).toBe('r1')
    expect(recipientsRepo.count(db)).toBe(0)
  })

  test('tokens: create / find / single-use consume', () => {
    const token = tokensRepo.create(db, {
      id: 'code-1',
      role: 'VIEWER',
      username: 'bob',
    })
    expect(token.role).toBe('VIEWER')
    expect(token.username).toBe('bob')

    expect(tokensRepo.find(db, 'code-1')?.id).toBe('code-1')

    const consumed = tokensRepo.consume(db, 'code-1')
    expect(consumed?.id).toBe('code-1')
    // consumed tokens are gone (single-use)
    expect(tokensRepo.find(db, 'code-1')).toBeUndefined()
    expect(tokensRepo.consume(db, 'code-1')).toBeUndefined()
  })

  test('events: upsert is idempotent on id, find / count', () => {
    const created = eventsRepo.upsert(db, makeEvent())
    expect(created.type).toBe('start')
    expect(eventsRepo.count(db)).toBe(1)

    const ended = eventsRepo.upsert(
      db,
      makeEvent({ type: 'end', endTime: 1700000050 }),
    )
    expect(ended.type).toBe('end')
    expect(ended.endTime).toBe(1700000050)
    // same id → still one row
    expect(eventsRepo.count(db)).toBe(1)
    expect(eventsRepo.find(db, created.id)?.type).toBe('end')
  })

  test('events: findByCode resolves via the supplied code resolver', () => {
    const event = eventsRepo.upsert(db, makeEvent())
    // Frigate-style resolver: code is the second dash-segment of the id.
    const resolve = (id: string) => id.split('-').at(1) ?? id
    // id 'cam-1700000000.123-abc' → code '1700000000.123'
    expect(eventsRepo.findByCode(db, '1700000000.123', resolve)?.id).toBe(
      event.id,
    )
    // 'abc' appears in the id but is not the resolved code → no match
    expect(eventsRepo.findByCode(db, 'abc', resolve)).toBeUndefined()
    expect(eventsRepo.findByCode(db, 'nope', resolve)).toBeUndefined()
  })

  test('events: clear returns affected count', () => {
    eventsRepo.upsert(db, makeEvent())
    expect(eventsRepo.count(db)).toBe(1)
    expect(eventsRepo.clear(db)).toBe(1)
    expect(eventsRepo.count(db)).toBe(0)
  })
})
