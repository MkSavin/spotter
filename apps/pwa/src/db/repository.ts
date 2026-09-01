import { and, desc, eq, sql } from 'drizzle-orm'
import type { PwaDatabase } from './client'
import {
  type DeviceRow,
  devices,
  notifiedEvents,
  type PushSubscriptionRow,
  pushSubscriptions,
  type RecentEvent,
  recentEvents,
  type TimelapseRow,
  timelapses,
} from './schema'

export type PushKeys = { endpoint: string; p256dh: string; auth: string }

/**
 * Identifies an export by what both sides know. The adapter's `ready` message
 * carries no request id, so the camera and the exact span are the correlation
 * key — and making it the row id means a redelivery updates the same row
 * instead of adding a duplicate.
 */
export const timelapseId = (
  camera: string,
  start: number,
  end: number,
): string => `${camera}:${start}:${end}`

export const timelapsesRepo = {
  start: (
    db: PwaDatabase,
    input: {
      camera: string
      start: number
      end: number
      speed: string
      requestedBy: string
    },
  ): TimelapseRow =>
    db
      .insert(timelapses)
      .values({
        id: timelapseId(input.camera, input.start, input.end),
        ...input,
        state: 'running',
      })
      .onConflictDoUpdate({
        target: timelapses.id,
        // Asking again for a span that failed should retry it, not show the
        // old failure forever.
        set: { state: 'running', reason: null, videoKey: null },
      })
      .returning()
      .get(),

  settle: (
    db: PwaDatabase,
    input: {
      camera: string
      start: number
      end: number
      speed: string
      state: 'ready' | 'failed'
      videoKey?: string
      reason?: string
    },
  ): void => {
    const id = timelapseId(input.camera, input.start, input.end)

    db.insert(timelapses)
      .values({
        id,
        camera: input.camera,
        start: input.start,
        end: input.end,
        speed: input.speed,
        state: input.state,
        videoKey: input.videoKey,
        reason: input.reason,
        // An export can finish after a restart that lost the request; record
        // it anyway rather than dropping a video that exists.
        requestedBy: 'unknown',
      })
      .onConflictDoUpdate({
        target: timelapses.id,
        set: {
          state: input.state,
          videoKey: input.videoKey,
          reason: input.reason,
        },
      })
      .run()
  },

  /**
   * Fails whatever this camera still has running. The adapter's failure notice
   * carries no span — only the camera and the reason — so there is nothing
   * finer to match on; in practice a camera has one export in flight.
   */
  failRunning: (db: PwaDatabase, camera: string, reason: string): void => {
    db.update(timelapses)
      .set({ state: 'failed', reason })
      .where(
        and(eq(timelapses.camera, camera), eq(timelapses.state, 'running')),
      )
      .run()
  },

  list: (db: PwaDatabase, limit = 50): TimelapseRow[] =>
    db
      .select()
      .from(timelapses)
      .orderBy(desc(timelapses.createdAt))
      .limit(limit)
      .all(),
}

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
