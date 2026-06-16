import { and, count, eq } from 'drizzle-orm'
import { isNumericId, normalizeUsername } from '../helpers/username'
import type { TelegramDatabase } from './client'
import {
  type EventMessage,
  type Role,
  type TgBinding,
  type TgChat,
  eventMessages,
  tgBindings,
  tgChats,
} from './schema'

export const tgChatsRepo = {
  listIds: (db: TelegramDatabase): Pick<TgChat, 'id'>[] =>
    db.select({ id: tgChats.id }).from(tgChats).all(),

  upsert: (db: TelegramDatabase, id: string): TgChat => {
    const existing = db
      .insert(tgChats)
      .values({ id })
      .onConflictDoNothing()
      .returning()
      .get()
    if (existing) return existing
    return db.select().from(tgChats).where(eq(tgChats.id, id)).get() as TgChat
  },

  remove: (db: TelegramDatabase, id: string): TgChat | undefined =>
    db.delete(tgChats).where(eq(tgChats.id, id)).returning().get(),
}

export const tgBindingsRepo = {
  list: (db: TelegramDatabase): TgBinding[] =>
    db.select().from(tgBindings).all(),

  find: (
    db: TelegramDatabase,
    tgUserId: string,
    tgChatId: string,
  ): TgBinding | undefined =>
    db
      .select()
      .from(tgBindings)
      .where(
        and(
          eq(tgBindings.tgUserId, tgUserId),
          eq(tgBindings.tgChatId, tgChatId),
        ),
      )
      .get(),

  findByRef: (db: TelegramDatabase, ref: string): TgBinding | undefined =>
    db
      .select()
      .from(tgBindings)
      .where(
        isNumericId(ref)
          ? eq(tgBindings.tgUserId, ref.trim())
          : eq(tgBindings.username, normalizeUsername(ref)),
      )
      .get(),

  findByRecipientUuid: (db: TelegramDatabase, uuid: string): TgBinding[] =>
    db
      .select()
      .from(tgBindings)
      .where(eq(tgBindings.recipientUuid, uuid))
      .all(),

  upsert: (
    db: TelegramDatabase,
    input: {
      tgUserId: string
      tgChatId: string
      recipientUuid: string
      username?: string | null
      role: Role
    },
  ): TgBinding =>
    db
      .insert(tgBindings)
      .values(input)
      .onConflictDoUpdate({
        target: [tgBindings.tgUserId, tgBindings.tgChatId],
        set: {
          recipientUuid: input.recipientUuid,
          username: input.username,
          role: input.role,
        },
      })
      .returning()
      .get(),

  setRole: (
    db: TelegramDatabase,
    recipientUuid: string,
    role: Role,
  ): number => {
    const result = db
      .update(tgBindings)
      .set({ role })
      .where(eq(tgBindings.recipientUuid, recipientUuid))
      .returning()
      .all()
    return result.length
  },

  removeByRecipientUuid: (db: TelegramDatabase, uuid: string): TgBinding[] =>
    db
      .delete(tgBindings)
      .where(eq(tgBindings.recipientUuid, uuid))
      .returning()
      .all(),

  remove: (
    db: TelegramDatabase,
    tgUserId: string,
    tgChatId: string,
  ): TgBinding | undefined =>
    db
      .delete(tgBindings)
      .where(
        and(
          eq(tgBindings.tgUserId, tgUserId),
          eq(tgBindings.tgChatId, tgChatId),
        ),
      )
      .returning()
      .get(),
}

export const eventMessagesRepo = {
  find: (db: TelegramDatabase, eventId: string): EventMessage[] =>
    db
      .select({ id: eventMessages.messageId, chatId: eventMessages.tgChatId })
      .from(eventMessages)
      .where(eq(eventMessages.eventId, eventId))
      .all(),

  count: (db: TelegramDatabase, eventId: string): number =>
    db
      .select({ value: count() })
      .from(eventMessages)
      .where(eq(eventMessages.eventId, eventId))
      .get()?.value ?? 0,

  set: (
    db: TelegramDatabase,
    eventId: string,
    messages: EventMessage[],
  ): void => {
    db.transaction((tx) => {
      tx.delete(eventMessages).where(eq(eventMessages.eventId, eventId)).run()

      if (messages.length > 0) {
        tx.insert(eventMessages)
          .values(
            messages.map((m) => ({
              eventId,
              tgChatId: m.chatId,
              messageId: m.id,
            })),
          )
          .run()
      }
    })
  },
}
