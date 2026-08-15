import type { SpotterEvent } from '@spotter/transport'
import { count, eq, like } from 'drizzle-orm'
import { isNumericId, normalizeUsername } from '../helpers/username'
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

  /** Resolves by numeric tg_user_id or @username (first match). */
  findByRef: (db: ServerDatabase, ref: string): Recipient | undefined =>
    db
      .select()
      .from(recipients)
      .where(
        isNumericId(ref)
          ? eq(recipients.tgUserId, ref.trim())
          : eq(recipients.username, normalizeUsername(ref)),
      )
      .get(),

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
    input: { id: string; role: Role; username?: string | null },
  ): AccessToken => db.insert(accessTokens).values(input).returning().get(),

  find: (db: ServerDatabase, id: string): AccessToken | undefined =>
    db.select().from(accessTokens).where(eq(accessTokens.id, id)).get(),

  consume: (db: ServerDatabase, id: string): AccessToken | undefined =>
    db.delete(accessTokens).where(eq(accessTokens.id, id)).returning().get(),
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
}
