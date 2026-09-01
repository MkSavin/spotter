import { beforeEach, describe, expect, test } from 'bun:test'
import { createDatabase, type TelegramDatabase } from './client'
import { eventMessagesRepo, tgBindingsRepo, tgChatsRepo } from './repository'

describe('telegram db repository', () => {
  let db: TelegramDatabase

  beforeEach(() => {
    // Fresh in-memory database with migrations applied for each test.
    db = createDatabase(':memory:')
  })

  test('tgChats: upsert is idempotent / list / remove', () => {
    tgChatsRepo.upsert(db, 'chat-1')
    tgChatsRepo.upsert(db, 'chat-1') // conflict path, no duplicate

    expect(tgChatsRepo.listIds(db)).toEqual([{ id: 'chat-1' }])

    const removed = tgChatsRepo.remove(db, 'chat-1')
    expect(removed?.id).toBe('chat-1')
    expect(tgChatsRepo.listIds(db)).toEqual([])
  })

  test('tgBindings: composite key, upsert / find / list / remove', () => {
    tgBindingsRepo.upsert(db, {
      tgUserId: 'u1',
      tgChatId: 'c1',
      recipientUuid: 'r1',
      username: 'alice',
      role: 'USER',
    })
    // same user in a different chat coexists (composite PK)
    tgBindingsRepo.upsert(db, {
      tgUserId: 'u1',
      tgChatId: 'c2',
      recipientUuid: 'r1',
      username: 'alice',
      role: 'ADMIN',
    })
    // update existing (u1, c1)
    const updated = tgBindingsRepo.upsert(db, {
      tgUserId: 'u1',
      tgChatId: 'c1',
      recipientUuid: 'r1',
      username: 'alice',
      role: 'ADMIN',
    })

    expect(updated.role).toBe('ADMIN')
    expect(tgBindingsRepo.list(db)).toHaveLength(2)
    expect(tgBindingsRepo.find(db, 'u1', 'c2')?.role).toBe('ADMIN')

    tgBindingsRepo.remove(db, 'u1', 'c1')
    expect(tgBindingsRepo.list(db)).toHaveLength(1)
    expect(tgBindingsRepo.find(db, 'u1', 'c1')).toBeUndefined()
  })

  test('tgBindings: findByRef by id and @username, setRole / removeByRecipientUuid', () => {
    tgBindingsRepo.upsert(db, {
      tgUserId: '12345',
      tgChatId: '12345',
      recipientUuid: 'r1',
      username: 'alice',
      role: 'VIEWER',
    })

    // by numeric id
    expect(tgBindingsRepo.findByRef(db, '12345')?.username).toBe('alice')
    // by @username, case-insensitive, leading @ tolerated
    expect(tgBindingsRepo.findByRef(db, '@Alice')?.tgUserId).toBe('12345')
    expect(tgBindingsRepo.findByRef(db, 'nobody')).toBeUndefined()

    const promoted = tgBindingsRepo.setRole(db, 'r1', 'USER')
    expect(promoted).toBe(1)
    expect(tgBindingsRepo.findByRef(db, '12345')?.role).toBe('USER')
    expect(tgBindingsRepo.findByRecipientUuid(db, 'r1')).toHaveLength(1)

    const removed = tgBindingsRepo.removeByRecipientUuid(db, 'r1')
    expect(removed).toHaveLength(1)
    expect(tgBindingsRepo.list(db)).toHaveLength(0)
  })

  test('eventMessages: record merges, find / count', () => {
    eventMessagesRepo.record(db, 'event-1', [
      { id: 10, chatId: 'c1' },
      { id: 20, chatId: 'c2' },
    ])

    expect(eventMessagesRepo.count(db, 'event-1')).toBe(2)
    expect(eventMessagesRepo.find(db, 'event-1')).toContainEqual({
      id: 10,
      chatId: 'c1',
    })

    eventMessagesRepo.record(db, 'event-1', [{ id: 30, chatId: 'c1' }])
    expect(eventMessagesRepo.find(db, 'event-1')).toContainEqual({
      id: 30,
      chatId: 'c1',
    })
    expect(eventMessagesRepo.count(db, 'event-1')).toBe(2)

    // A delivery where every chat failed must not wipe the served ones.
    eventMessagesRepo.record(db, 'event-1', [])
    expect(eventMessagesRepo.count(db, 'event-1')).toBe(2)
  })

  test('eventMessages: forget drops only the named chats', () => {
    eventMessagesRepo.record(db, 'event-2', [
      { id: 10, chatId: 'c1' },
      { id: 20, chatId: 'c2' },
    ])

    eventMessagesRepo.forget(db, 'event-2', ['c1'])

    expect(eventMessagesRepo.find(db, 'event-2')).toEqual([
      { id: 20, chatId: 'c2' },
    ])

    eventMessagesRepo.forget(db, 'event-2', [])
    expect(eventMessagesRepo.count(db, 'event-2')).toBe(1)
  })
})

describe('event message retention', () => {
  let db: TelegramDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('drops links older than the cutoff', () => {
    eventMessagesRepo.record(db, 'old', [{ id: 1, chatId: 'c1' }])
    db.$client
      .query('UPDATE event_messages SET sent_at = ? WHERE event_id = ?')
      .run(Date.now() - 40 * 24 * 60 * 60 * 1000, 'old')
    eventMessagesRepo.record(db, 'recent', [{ id: 2, chatId: 'c1' }])

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    expect(eventMessagesRepo.prune(db, cutoff)).toBe(1)
    expect(eventMessagesRepo.count(db, 'recent')).toBe(1)
    expect(eventMessagesRepo.count(db, 'old')).toBe(0)
  })
})
