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

    // Re-recording one chat updates that row and leaves the others alone.
    eventMessagesRepo.record(db, 'event-1', [{ id: 30, chatId: 'c1' }])
    expect(eventMessagesRepo.find(db, 'event-1')).toContainEqual({
      id: 30,
      chatId: 'c1',
    })
    expect(eventMessagesRepo.count(db, 'event-1')).toBe(2)

    // The duplicate-message bug: a delivery where every chat failed records
    // nothing, and must NOT wipe the chats that already got the message.
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

    // An empty list is a no-op, not a wipe.
    eventMessagesRepo.forget(db, 'event-2', [])
    expect(eventMessagesRepo.count(db, 'event-2')).toBe(1)
  })
})
