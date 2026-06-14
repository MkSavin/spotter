import type { SpotterEvent } from '@spotter/transport'
import { and, count, eq } from 'drizzle-orm'
import type { BotDatabase } from './client'
import {
  events,
  type Chat,
  type Event,
  type EventMessage,
  type Role,
  type User,
  chats,
  eventMessages,
  users,
} from './schema'

export type EventWithMessages = Event & { messages: EventMessage[] }

const total = (
  db: BotDatabase,
  table: typeof users | typeof chats | typeof events,
): number => db.select({ value: count() }).from(table).get()?.value ?? 0

export const usersRepo = {
  list: (db: BotDatabase): Pick<User, 'id' | 'chatId' | 'role'>[] =>
    db
      .select({ id: users.id, chatId: users.chatId, role: users.role })
      .from(users)
      .all(),

  find: (db: BotDatabase, id: string, chatId: string): User | undefined =>
    db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.chatId, chatId)))
      .get(),

  upsert: (
    db: BotDatabase,
    input: { id: string; chatId: string; role: Role; token: string },
  ): User =>
    db
      .insert(users)
      .values(input)
      .onConflictDoUpdate({
        target: [users.id, users.chatId],
        set: { role: input.role, token: input.token },
      })
      .returning()
      .get(),

  remove: (db: BotDatabase, id: string, chatId: string): User | undefined =>
    db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.chatId, chatId)))
      .returning()
      .get(),

  count: (db: BotDatabase): number => total(db, users),
}

export const chatsRepo = {
  listIds: (db: BotDatabase): Pick<Chat, 'id'>[] =>
    db.select({ id: chats.id }).from(chats).all(),

  upsert: (db: BotDatabase, input: { id: string; token: string }): Chat =>
    db
      .insert(chats)
      .values(input)
      .onConflictDoUpdate({ target: chats.id, set: { token: input.token } })
      .returning()
      .get(),

  remove: (db: BotDatabase, id: string): Chat | undefined =>
    db.delete(chats).where(eq(chats.id, id)).returning().get(),

  count: (db: BotDatabase): number => total(db, chats),
}

const withMessages = (db: BotDatabase, event: Event): EventWithMessages => ({
  ...event,
  messages: db
    .select({ id: eventMessages.messageId, chatId: eventMessages.chatId })
    .from(eventMessages)
    .where(eq(eventMessages.eventId, event.id))
    .all(),
})

export const eventsRepo = {
  find: (db: BotDatabase, id: string): EventWithMessages | undefined => {
    const event = db.select().from(events).where(eq(events.id, id)).get()
    return event ? withMessages(db, event) : undefined
  },

  upsert: (db: BotDatabase, event: SpotterEvent): EventWithMessages => {
    const { id, ...rest } = event
    const stored = db
      .insert(events)
      .values(event)
      .onConflictDoUpdate({ target: events.id, set: rest })
      .returning()
      .get()

    return withMessages(db, stored)
  },

  // Replaces the full set of sent messages for an event (mirrors the old
  // `event.update({ data: { messages } })` on the embedded array).
  setMessages: (
    db: BotDatabase,
    id: string,
    messages: EventMessage[],
  ): void => {
    db.transaction((tx) => {
      tx.delete(eventMessages).where(eq(eventMessages.eventId, id)).run()

      if (messages.length > 0) {
        tx.insert(eventMessages)
          .values(
            messages.map((message) => ({
              eventId: id,
              chatId: message.chatId,
              messageId: message.id,
            })),
          )
          .run()
      }
    })
  },

  count: (db: BotDatabase): number => total(db, events),

  clear: (db: BotDatabase): number =>
    db.delete(events).returning({ id: events.id }).all().length,
}
