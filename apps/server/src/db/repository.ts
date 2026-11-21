import {
  isNumericId,
  normalizeUsername,
  type SpotterEvent,
} from '@spotter/transport'
import { and, count, eq, isNotNull, like, lt } from 'drizzle-orm'
import type { ServerDatabase } from './client'
import {
  type AccessToken,
  accessTokens,
  type Event,
  events,
  type Recipient,
  type Role,
  recipients,
} from './schema'

export const inTransaction = <T>(db: ServerDatabase, work: () => T): T =>
  db.$client.transaction(work).immediate()

const total = (
  db: ServerDatabase,
  table: typeof recipients | typeof events,
): number => db.select({ value: count() }).from(table).get()?.value ?? 0

export const recipientsRepo = {
  list: (db: ServerDatabase): Recipient[] => db.select().from(recipients).all(),

  find: (db: ServerDatabase, uuid: string): Recipient | undefined =>
    db.select().from(recipients).where(eq(recipients.uuid, uuid)).get(),

  findByTgUserId: (
    db: ServerDatabase,
    tgUserId: string,
  ): Recipient | undefined =>
    db.select().from(recipients).where(eq(recipients.tgUserId, tgUserId)).get(),

  /** Resolves by UUID or a legacy Telegram reference. */
  findByRef: (db: ServerDatabase, ref: string): Recipient | undefined => {
    const trimmed = ref.trim()
    const byUuid = db
      .select()
      .from(recipients)
      .where(eq(recipients.uuid, trimmed))
      .get()
    if (byUuid) return byUuid

    return db
      .select()
      .from(recipients)
      .where(
        isNumericId(trimmed)
          ? eq(recipients.tgUserId, trimmed)
          : and(
              isNotNull(recipients.tgUserId),
              eq(recipients.username, normalizeUsername(trimmed)),
            ),
      )
      .get()
  },

  upsertByTgUserId: (
    db: ServerDatabase,
    input: {
      uuid: string
      tgUserId: string
      username?: string | null
      role: Role
    },
  ): Recipient =>
    db
      .insert(recipients)
      .values(input)
      .onConflictDoUpdate({
        target: recipients.tgUserId,
        set: { username: input.username, role: input.role },
      })
      .returning()
      .get(),

  upsertByDeviceId: (
    db: ServerDatabase,
    input: {
      uuid: string
      deviceId: string
      role: Role
    },
  ): Recipient =>
    db
      .insert(recipients)
      .values(input)
      .onConflictDoUpdate({
        target: recipients.deviceId,
        set: { role: input.role },
      })
      .returning()
      .get(),

  upsertByAppercotUserId: (
    db: ServerDatabase,
    input: {
      uuid: string
      appercotUserId: string
      username: string | null
      role: Role
    },
  ): Recipient =>
    db
      .insert(recipients)
      .values(input)
      .onConflictDoUpdate({
        target: recipients.appercotUserId,
        set: { username: input.username, role: input.role },
      })
      .returning()
      .get(),

  setRole: (
    db: ServerDatabase,
    uuid: string,
    role: Role,
  ): Recipient | undefined =>
    db
      .update(recipients)
      .set({ role })
      .where(eq(recipients.uuid, uuid))
      .returning()
      .get(),

  remove: (db: ServerDatabase, uuid: string): Recipient | undefined =>
    db.delete(recipients).where(eq(recipients.uuid, uuid)).returning().get(),

  count: (db: ServerDatabase): number => total(db, recipients),
}

export const tokensRepo = {
  create: (
    db: ServerDatabase,
    input: {
      id: string
      role: Role
      username?: string | null
      platform?: AccessToken['platform']
    },
  ): AccessToken => db.insert(accessTokens).values(input).returning().get(),

  find: (db: ServerDatabase, id: string): AccessToken | undefined =>
    db.select().from(accessTokens).where(eq(accessTokens.id, id)).get(),

  consume: (db: ServerDatabase, id: string): AccessToken | undefined =>
    db.delete(accessTokens).where(eq(accessTokens.id, id)).returning().get(),

  /** Drops codes nobody redeemed in time, so the table cannot grow unbounded. */
  prune: (db: ServerDatabase, cutoff: Date): number =>
    db
      .delete(accessTokens)
      .where(lt(accessTokens.createdAt, cutoff))
      .returning({ id: accessTokens.id })
      .all().length,
}

export const eventsRepo = {
  find: (db: ServerDatabase, id: string): Event | undefined =>
    db.select().from(events).where(eq(events.id, id)).get(),

  findByCode: (
    db: ServerDatabase,
    code: string,
    resolveCode: (id: string) => string,
  ): Event | undefined => {
    const candidates = db
      .select()
      .from(events)
      .where(like(events.id, `%${code}%`))
      .all()
    return candidates.find((e) => resolveCode(e.id) === code)
  },

  upsert: (db: ServerDatabase, event: SpotterEvent): Event => {
    const { id, ...rest } = event
    return db
      .insert(events)
      .values({
        ...event,
        source: event.source ?? null,
        label: event.label ?? null,
      })
      .onConflictDoUpdate({
        target: events.id,
        set: {
          ...rest,
          source: event.source ?? null,
          label: event.label ?? null,
        },
      })
      .returning()
      .get()
  },

  count: (db: ServerDatabase): number => total(db, events),

  clear: (db: ServerDatabase): number =>
    db.delete(events).returning({ id: events.id }).all().length,

  /**
   * Drops events that started before `cutoff`. Keyed on `start_time` (unix
   * seconds, straight from the NVR) rather than an insertion stamp: the age
   * that matters is the event's own, and it needs no extra column.
   */
  prune: (db: ServerDatabase, cutoff: Date): number =>
    db
      .delete(events)
      .where(lt(events.startTime, cutoff.getTime() / 1000))
      .returning({ id: events.id })
      .all().length,
}
