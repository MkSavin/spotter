import { and, count, eq, inArray, lt, sql } from 'drizzle-orm'
import { isNumericId, normalizeUsername } from '../helpers/username'
import type { TelegramDatabase } from './client'
import {
  type DialogStateRow,
  dialogStates,
  type EventMessage,
  eventMessages,
  type Role,
  type ServiceVersion,
  serviceVersions,
  type TgBinding,
  type TgChat,
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

  /** Additive upsert: a wipe would make the retry re-send to served chats. */
  record: (
    db: TelegramDatabase,
    eventId: string,
    messages: EventMessage[],
  ): void => {
    if (messages.length === 0) return

    db.insert(eventMessages)
      .values(
        messages.map((m) => ({
          eventId,
          tgChatId: m.chatId,
          messageId: m.id,
        })),
      )
      .onConflictDoUpdate({
        target: [eventMessages.eventId, eventMessages.tgChatId],
        set: { messageId: sql`excluded.message_id` },
      })
      .run()
  },

  /** Drops the messages of chats that are no longer subscribed. */
  forget: (db: TelegramDatabase, eventId: string, chatIds: string[]): void => {
    if (chatIds.length === 0) return

    db.delete(eventMessages)
      .where(
        and(
          eq(eventMessages.eventId, eventId),
          inArray(eventMessages.tgChatId, chatIds),
        ),
      )
      .run()
  },
}

export const serviceVersionsRepo = {
  list: (db: TelegramDatabase): ServiceVersion[] =>
    db.select().from(serviceVersions).all(),

  /** Stores the version, returns the replaced one. In a transaction: two heartbeats must not both report. */
  record: (
    db: TelegramDatabase,
    node: string,
    service: string,
    version: string,
  ): string | undefined =>
    db.transaction((tx) => {
      const previous = tx
        .select({ version: serviceVersions.version })
        .from(serviceVersions)
        .where(
          and(
            eq(serviceVersions.node, node),
            eq(serviceVersions.service, service),
          ),
        )
        .get()?.version

      if (previous === version) return version

      tx.insert(serviceVersions)
        .values({ node, service, version, seenAt: new Date() })
        .onConflictDoUpdate({
          target: [serviceVersions.node, serviceVersions.service],
          set: { version, seenAt: new Date() },
        })
        .run()

      return previous
    }),
}

export const dialogStatesRepo = {
  find: (
    db: TelegramDatabase,
    tgUserId: string,
    tgChatId: string,
  ): DialogStateRow | undefined =>
    db
      .select()
      .from(dialogStates)
      .where(
        and(
          eq(dialogStates.tgUserId, tgUserId),
          eq(dialogStates.tgChatId, tgChatId),
        ),
      )
      .get(),

  save: (
    db: TelegramDatabase,
    tgUserId: string,
    tgChatId: string,
    state: string,
  ): void => {
    db.insert(dialogStates)
      .values({ tgUserId, tgChatId, state, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [dialogStates.tgUserId, dialogStates.tgChatId],
        set: { state, updatedAt: new Date() },
      })
      .run()
  },

  remove: (db: TelegramDatabase, tgUserId: string, tgChatId: string): void => {
    db.delete(dialogStates)
      .where(
        and(
          eq(dialogStates.tgUserId, tgUserId),
          eq(dialogStates.tgChatId, tgChatId),
        ),
      )
      .run()
  },

  /** Drops dialogs older than the TTL so abandoned ones do not accumulate. */
  prune: (db: TelegramDatabase, olderThan: Date): number =>
    db
      .delete(dialogStates)
      .where(lt(dialogStates.updatedAt, olderThan))
      .returning()
      .all().length,
}
