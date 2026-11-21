import type { MessageContent } from '@appercot/protocol'
import {
  type CatalogStore,
  type DeliveryEvent,
  safeParseCatalog,
} from '@spotter/transport'
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm'
import type { AppercotDatabase } from './client'
import {
  type Chat,
  catalogs,
  chats,
  type EventMessage,
  eventMessages,
  events,
  interactions,
  requests,
} from './schema'

export const chatsRepo = {
  find: (db: AppercotDatabase, id: string) =>
    db.select().from(chats).where(eq(chats.id, id)).get(),
  forRecipient: (db: AppercotDatabase, uuid: string) =>
    db.select().from(chats).where(eq(chats.recipientUuid, uuid)).all(),
  deliverable: (db: AppercotDatabase) =>
    db
      .select()
      .from(chats)
      .where(
        and(
          isNotNull(chats.role),
          eq(chats.blocked, false),
          or(isNull(chats.mutedUntil), lt(chats.mutedUntil, Date.now())),
        ),
      )
      .all(),
  bind: (db: AppercotDatabase, values: typeof chats.$inferInsert) =>
    db
      .insert(chats)
      .values(values)
      .onConflictDoUpdate({ target: chats.id, set: values })
      .run(),
  update: (
    db: AppercotDatabase,
    id: string,
    values: Partial<
      Pick<Chat, 'recipientUuid' | 'role' | 'blocked' | 'mutedUntil'>
    >,
  ) => db.update(chats).set(values).where(eq(chats.id, id)).run(),
}

export const eventsRepo = {
  find: (db: AppercotDatabase, id: string) =>
    db.select().from(events).where(eq(events.id, id)).get(),
  save: (
    db: AppercotDatabase,
    { eventId, event, clipKey, snapshotKey }: DeliveryEvent,
  ) => {
    const values = {
      id: eventId,
      event,
      snapshotKey,
      clipKey,
      clipUntil: clipKey ? null : undefined,
      clipStatus: clipKey ? null : undefined,
      updatedAt: Date.now(),
    }
    return db
      .insert(events)
      .values(values)
      .onConflictDoUpdate({ target: events.id, set: values })
      .returning()
      .get()
  },
  clipState: (
    db: AppercotDatabase,
    id: string,
    clipUntil: number | null,
    clipStatus: string | null,
  ) =>
    db
      .update(events)
      .set({ clipUntil, clipStatus })
      .where(eq(events.id, id))
      .run(),
}

export const messagesRepo = {
  resolve: (db: AppercotDatabase, chatId: string, id: string) =>
    db
      .select()
      .from(eventMessages)
      .where(
        and(eq(eventMessages.chatId, chatId), eq(eventMessages.messageId, id)),
      )
      .get(),
  forEvent: (db: AppercotDatabase, eventId: string) =>
    db
      .select()
      .from(eventMessages)
      .where(eq(eventMessages.eventId, eventId))
      .all(),
  save: (db: AppercotDatabase, values: EventMessage) =>
    db
      .insert(eventMessages)
      .values(values)
      .onConflictDoUpdate({
        target: [eventMessages.eventId, eventMessages.chatId],
        set: values,
      })
      .run(),
  clearChat: (db: AppercotDatabase, chatId: string) =>
    db.delete(eventMessages).where(eq(eventMessages.chatId, chatId)).run(),
}

export const requestsRepo = {
  find: (db: AppercotDatabase, id: string) =>
    db.select().from(requests).where(eq(requests.id, id)).get(),
  save: (db: AppercotDatabase, values: typeof requests.$inferInsert) =>
    db.insert(requests).values(values).run(),
  update: (
    db: AppercotDatabase,
    id: string,
    values: Pick<
      Partial<typeof requests.$inferSelect>,
      'key' | 'done' | 'fileId' | 'outcome' | 'delivered'
    >,
  ) => db.update(requests).set(values).where(eq(requests.id, id)).run(),
  undelivered: (db: AppercotDatabase, chatId: string) =>
    db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.chatId, chatId),
          isNotNull(requests.outcome),
          eq(requests.delivered, false),
        ),
      )
      .all(),
  runningTimelapses: (
    db: AppercotDatabase,
    chatId: string,
    recipientUuid: string,
  ) =>
    db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.chatId, chatId),
          eq(requests.recipientUuid, recipientUuid),
          eq(requests.kind, 'timelapse'),
          eq(requests.done, false),
        ),
      )
      .all(),
}

export const interactionsRepo = {
  find: (db: AppercotDatabase, id: string) =>
    db.select().from(interactions).where(eq(interactions.id, id)).get(),
  record: (db: AppercotDatabase, id: string, content: MessageContent | null) =>
    db
      .insert(interactions)
      .values({ id, content, createdAt: Date.now() })
      .run(),
  sent: (db: AppercotDatabase, id: string) =>
    db
      .update(interactions)
      .set({ sent: true })
      .where(eq(interactions.id, id))
      .run(),
}

export const catalogStore = (db: AppercotDatabase): CatalogStore => ({
  load: (source) =>
    safeParseCatalog(
      db.select().from(catalogs).where(eq(catalogs.source, source)).get()
        ?.snapshot,
    ) ?? undefined,
  save: (snapshot) => {
    db.insert(catalogs)
      .values({ source: snapshot.source, snapshot })
      .onConflictDoUpdate({ target: catalogs.source, set: { snapshot } })
      .run()
  },
})

export const prune = (db: AppercotDatabase, cutoff: Date) =>
  db.transaction(() => {
    const since = cutoff.getTime()
    return (
      db
        .delete(events)
        .where(lt(events.updatedAt, since))
        .returning({ id: events.id })
        .all().length +
      db
        .delete(requests)
        .where(lt(requests.createdAt, since))
        .returning({ id: requests.id })
        .all().length +
      db
        .delete(interactions)
        .where(lt(interactions.createdAt, since))
        .returning({ id: interactions.id })
        .all().length
    )
  })
