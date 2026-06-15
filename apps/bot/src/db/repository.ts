import type { SpotterEvent } from '@spotter/transport'
import { and, count, eq, like } from 'drizzle-orm'
import { isNumericId, normalizeUsername } from '../helpers/username'
import type { BotDatabase } from './client'
import {
  events,
  type AccessToken,
  type Chat,
  type Event,
  type EventMessage,
  type Role,
  type User,
  accessTokens,
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
  list: (
    db: BotDatabase,
  ): Pick<User, 'id' | 'chatId' | 'username' | 'role'>[] =>
    db
      .select({
        id: users.id,
        chatId: users.chatId,
        username: users.username,
        role: users.role,
      })
      .from(users)
      .all(),

  find: (db: BotDatabase, id: string, chatId: string): User | undefined =>
    db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.chatId, chatId)))
      .get(),

  // Resolves a user by an admin-supplied reference: numeric Telegram id or
  // @username. Returns the first matching row (in private chats a user has one).
  findByRef: (db: BotDatabase, ref: string): User | undefined =>
    db
      .select()
      .from(users)
      .where(
        isNumericId(ref)
          ? eq(users.id, ref.trim())
          : eq(users.username, normalizeUsername(ref)),
      )
      .get(),

  upsert: (
    db: BotDatabase,
    input: {
      id: string
      chatId: string
      username?: string | null
      role: Role
      token: string
    },
  ): User =>
    db
      .insert(users)
      .values(input)
      .onConflictDoUpdate({
        target: [users.id, users.chatId],
        set: {
          username: input.username,
          role: input.role,
          token: input.token,
        },
      })
      .returning()
      .get(),

  // Changes a user's role across every chat they belong to.
  setRoleById: (db: BotDatabase, id: string, role: Role): User[] =>
    db.update(users).set({ role }).where(eq(users.id, id)).returning().all(),

  remove: (db: BotDatabase, id: string, chatId: string): User | undefined =>
    db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.chatId, chatId)))
      .returning()
      .get(),

  // Removes a user from every chat (used by /user_revoke).
  removeById: (db: BotDatabase, id: string): User[] =>
    db.delete(users).where(eq(users.id, id)).returning().all(),

  count: (db: BotDatabase): number => total(db, users),
}

export const tokensRepo = {
  create: (
    db: BotDatabase,
    input: { id: string; role: Role; username?: string | null },
  ): AccessToken => db.insert(accessTokens).values(input).returning().get(),

  find: (db: BotDatabase, id: string): AccessToken | undefined =>
    db.select().from(accessTokens).where(eq(accessTokens.id, id)).get(),

  // Single-use: deletes the token and returns it if it existed.
  consume: (db: BotDatabase, id: string): AccessToken | undefined =>
    db.delete(accessTokens).where(eq(accessTokens.id, id)).returning().get(),
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

  // Looks up an event by the short code shown to users. How a code maps to an id
  // is endpoint-specific (`nvr.resolveEventCode`), so we narrow candidates with a
  // LIKE and disambiguate with the supplied resolver — keeping this repo
  // NVR-agnostic.
  findByCode: (
    db: BotDatabase,
    code: string,
    resolveCode: (id: string) => string,
  ): EventWithMessages | undefined => {
    const candidates = db
      .select()
      .from(events)
      .where(like(events.id, `%${code}%`))
      .all()
    const event = candidates.find(
      (candidate) => resolveCode(candidate.id) === code,
    )
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
