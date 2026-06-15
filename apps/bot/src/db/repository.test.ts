import { beforeEach, describe, expect, test } from 'bun:test'
import type { SpotterEvent } from '@spotter/transport'
import { type BotDatabase, createDatabase } from './client'
import { chatsRepo, eventsRepo, tokensRepo, usersRepo } from './repository'

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

describe('db repository', () => {
  let db: BotDatabase

  beforeEach(() => {
    // Fresh in-memory database with migrations applied for each test.
    db = createDatabase(':memory:')
  })

  test('chats: upsert / list / count / remove', () => {
    chatsRepo.upsert(db, { id: 'chat-1', token: 'token-1' })
    chatsRepo.upsert(db, { id: 'chat-1', token: 'token-2' }) // update path

    expect(chatsRepo.count(db)).toBe(1)
    expect(chatsRepo.listIds(db)).toEqual([{ id: 'chat-1' }])

    const removed = chatsRepo.remove(db, 'chat-1')
    expect(removed?.token).toBe('token-2')
    expect(chatsRepo.count(db)).toBe(0)
  })

  test('users: composite key, upsert / find / list / remove', () => {
    usersRepo.upsert(db, {
      id: 'u1',
      chatId: 'c1',
      role: 'USER',
      token: 't1',
    })
    // same user in a different chat coexists (composite PK)
    usersRepo.upsert(db, {
      id: 'u1',
      chatId: 'c2',
      role: 'ADMIN',
      token: 't2',
    })
    // update existing (u1, c1)
    const updated = usersRepo.upsert(db, {
      id: 'u1',
      chatId: 'c1',
      role: 'ADMIN',
      token: 't3',
    })

    expect(updated.role).toBe('ADMIN')
    expect(usersRepo.count(db)).toBe(2)
    expect(usersRepo.find(db, 'u1', 'c2')?.token).toBe('t2')
    expect(usersRepo.list(db)).toHaveLength(2)

    usersRepo.remove(db, 'u1', 'c1')
    expect(usersRepo.count(db)).toBe(1)
    expect(usersRepo.find(db, 'u1', 'c1')).toBeUndefined()
  })

  test('users: findByRef by id and @username, setRoleById / removeById', () => {
    usersRepo.upsert(db, {
      id: '12345',
      chatId: '12345',
      username: 'alice',
      role: 'VIEWER',
      token: 't1',
    })

    // by numeric id
    expect(usersRepo.findByRef(db, '12345')?.username).toBe('alice')
    // by @username, case-insensitive, leading @ tolerated
    expect(usersRepo.findByRef(db, '@Alice')?.id).toBe('12345')
    expect(usersRepo.findByRef(db, 'nobody')).toBeUndefined()

    const promoted = usersRepo.setRoleById(db, '12345', 'USER')
    expect(promoted).toHaveLength(1)
    expect(usersRepo.findByRef(db, '12345')?.role).toBe('USER')

    const removed = usersRepo.removeById(db, '12345')
    expect(removed).toHaveLength(1)
    expect(usersRepo.count(db)).toBe(0)
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

  test('events: upsert returns messages, setMessages replaces them', () => {
    const created = eventsRepo.upsert(db, makeEvent())
    expect(created.messages).toEqual([])
    expect(created.type).toBe('start')

    // update path preserves messages set separately
    eventsRepo.setMessages(db, created.id, [
      { id: 10, chatId: 'c1' },
      { id: 20, chatId: 'c2' },
    ])

    const ended = eventsRepo.upsert(
      db,
      makeEvent({ type: 'end', endTime: 1700000050 }),
    )
    expect(ended.type).toBe('end')
    expect(ended.messages).toHaveLength(2)
    expect(ended.messages).toContainEqual({ id: 10, chatId: 'c1' })

    // replace with a smaller set
    eventsRepo.setMessages(db, created.id, [{ id: 30, chatId: 'c1' }])
    expect(eventsRepo.find(db, created.id)?.messages).toEqual([
      { id: 30, chatId: 'c1' },
    ])
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

  test('events: clear returns affected count and cascades messages', () => {
    const event = eventsRepo.upsert(db, makeEvent())
    eventsRepo.setMessages(db, event.id, [{ id: 1, chatId: 'c1' }])

    expect(eventsRepo.count(db)).toBe(1)
    expect(eventsRepo.clear(db)).toBe(1)
    expect(eventsRepo.count(db)).toBe(0)
    // cascade: messages gone with the event, re-creating has none
    expect(eventsRepo.upsert(db, makeEvent()).messages).toEqual([])
  })
})
