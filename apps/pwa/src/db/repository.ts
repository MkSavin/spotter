import { desc, eq, sql } from 'drizzle-orm'
import type { PwaDatabase } from './client'
import {
  type DeviceRow,
  devices,
  notifiedEvents,
  type PushSubscriptionRow,
  pushSubscriptions,
  type RecentEvent,
  recentEvents,
} from './schema'

export type PushKeys = { endpoint: string; p256dh: string; auth: string }

export const devicesRepo = {
  /** Records an authorized install, replacing any earlier grant for it. */
  authorize: (
    db: PwaDatabase,
    input: {
      deviceId: string
      token: string
      recipientUuid: string
      role: string
      label?: string | null
    },
  ): DeviceRow =>
    db
      .insert(devices)
      .values(input)
      .onConflictDoUpdate({
        target: devices.deviceId,
        set: {
          token: input.token,
          recipientUuid: input.recipientUuid,
          role: input.role,
          seenAt: new Date(),
        },
      })
      .returning()
      .get(),

  findByToken: (db: PwaDatabase, token: string): DeviceRow | undefined =>
    db.select().from(devices).where(eq(devices.token, token)).get(),

  /** Applies a role change pushed by the domain. */
  setRole: (db: PwaDatabase, recipientUuid: string, role: string): void => {
    db.update(devices)
      .set({ role })
      .where(eq(devices.recipientUuid, recipientUuid))
      .run()
  },

  /** Drops every install of a revoked recipient. */
  revoke: (db: PwaDatabase, recipientUuid: string): void => {
    db.delete(devices).where(eq(devices.recipientUuid, recipientUuid)).run()
  },

  touch: (db: PwaDatabase, deviceId: string): void => {
    db.update(devices)
      .set({ seenAt: new Date() })
      .where(eq(devices.deviceId, deviceId))
      .run()
  },
}

export const subscriptionsRepo = {
  /** Upserts a device subscription by endpoint, returning the stored row. */
  upsert: (
    db: PwaDatabase,
    keys: PushKeys,
    deviceLabel?: string,
  ): PushSubscriptionRow =>
    db
      .insert(pushSubscriptions)
      .values({ ...keys, deviceLabel })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: keys.p256dh, auth: keys.auth },
      })
      .returning()
      .get(),

  list: (db: PwaDatabase): PushSubscriptionRow[] =>
    db.select().from(pushSubscriptions).all(),

  findByEndpoint: (
    db: PwaDatabase,
    endpoint: string,
  ): PushSubscriptionRow | undefined =>
    db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .get(),

  bindRecipient: (
    db: PwaDatabase,
    endpoint: string,
    recipientUuid: string,
  ): void => {
    db.update(pushSubscriptions)
      .set({ recipientUuid })
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .run()
  },

  remove: (db: PwaDatabase, endpoint: string): void => {
    db.delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .run()
  },
}

export const notifiedEventsRepo = {
  /**
   * Atomically claims an event for pushing. Returns `true` on first sight
   * (caller should push), `false` if already recorded (a redelivery — skip).
   * `onConflictDoNothing` fuses the check and insert into one race-free step.
   */
  claim: (db: PwaDatabase, eventId: string): boolean =>
    db
      .insert(notifiedEvents)
      .values({ eventId })
      .onConflictDoNothing()
      .returning()
      .get() !== undefined,

  /** Releases a claim so the regulator retries after a push failure. */
  release: (db: PwaDatabase, eventId: string): void => {
    db.delete(notifiedEvents).where(eq(notifiedEvents.eventId, eventId)).run()
  },
}

export const recentEventsRepo = {
  /** Upserts a feed entry and trims the cache to the newest `limit` rows. */
  save: (
    db: PwaDatabase,
    eventId: string,
    payload: unknown,
    limit: number,
  ): void => {
    db.insert(recentEvents)
      .values({ eventId, payload })
      .onConflictDoUpdate({
        target: recentEvents.eventId,
        set: { payload },
      })
      .run()

    // Order by rowid too: many events can land in the same millisecond, and
    // created_at alone would trim an arbitrary set among the ties.
    db.run(sql`
      DELETE FROM recent_events
      WHERE rowid NOT IN (
        SELECT rowid FROM recent_events
        ORDER BY created_at DESC, rowid DESC LIMIT ${limit}
      )
    `)
  },

  list: (db: PwaDatabase, limit: number): RecentEvent[] =>
    db
      .select()
      .from(recentEvents)
      .orderBy(desc(recentEvents.createdAt), desc(sql`rowid`))
      .limit(limit)
      .all(),

  get: (db: PwaDatabase, eventId: string): RecentEvent | undefined =>
    db
      .select()
      .from(recentEvents)
      .where(eq(recentEvents.eventId, eventId))
      .get(),
}
