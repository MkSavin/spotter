import { beforeEach, describe, expect, test } from 'bun:test'
import { type TelegramDatabase, createDatabase } from './client'
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

  test('eventMessages: set replaces, find / count', () => {
    eventMessagesRepo.set(db, 'event-1', [
      { id: 10, chatId: 'c1' },
      { id: 20, chatId: 'c2' },
    ])

    expect(eventMessagesRepo.count(db, 'event-1')).toBe(2)
    expect(eventMessagesRepo.find(db, 'event-1')).toContainEqual({
      id: 10,
      chatId: 'c1',
    })

    // replace with a smaller set
    eventMessagesRepo.set(db, 'event-1', [{ id: 30, chatId: 'c1' }])
    expect(eventMessagesRepo.find(db, 'event-1')).toEqual([
      { id: 30, chatId: 'c1' },
    ])

    // clearing with an empty set removes all rows
    eventMessagesRepo.set(db, 'event-1', [])
    expect(eventMessagesRepo.count(db, 'event-1')).toBe(0)
  })
})
