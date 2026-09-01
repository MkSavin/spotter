import { z } from 'zod'

const pushKeys = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

export const subscribeBody = z.object({
  subscription: pushKeys,
  deviceLabel: z.string().max(64).optional(),
})
export type SubscribeBody = z.infer<typeof subscribeBody>

export const unsubscribeBody = z.object({
  endpoint: z.string().url(),
})
export type UnsubscribeBody = z.infer<typeof unsubscribeBody>

export const testPushBody = z.object({
  endpoint: z.string().url(),
})
export type TestPushBody = z.infer<typeof testPushBody>

export const authBody = z.object({
  /** Stable per install; the client generates and keeps it. */
  deviceId: z.string().min(8).max(128),
  code: z.string().min(1).max(64),
  label: z.string().max(64).optional(),
})
export type AuthBody = z.infer<typeof authBody>

/** Asks the adapter for a camera's latest frame. */
export const snapshotBody = z.object({
  camera: z.string().min(1).max(64),
})
export type SnapshotBody = z.infer<typeof snapshotBody>

/** Starts a timelapse export. Times are unix seconds. */
export const timelapseBody = z.object({
  camera: z.string().min(1).max(64),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  speed: z.enum(['realtime', 'timelapse']),
})
export type TimelapseBody = z.infer<typeof timelapseBody>

/** Changes a recipient's role. `ref` is a uuid, @username or Telegram id. */
export const setRoleBody = z.object({
  ref: z.string().min(1).max(128),
  role: z.enum(['VIEWER', 'USER', 'ADMIN']),
})
export type SetRoleBody = z.infer<typeof setRoleBody>

export const revokeBody = z.object({
  ref: z.string().min(1).max(128),
})
export type RevokeBody = z.infer<typeof revokeBody>

/** Mints an access code; `username` binds it to one Telegram account. */
export const signBody = z.object({
  role: z.enum(['VIEWER', 'USER', 'ADMIN']),
  username: z.string().max(64).optional(),
})
export type SignBody = z.infer<typeof signBody>

/** Asks for an event's clip to be fetched and transcoded. */
export const clipBody = z.object({
  eventId: z.string().min(1).max(128),
})
export type ClipBody = z.infer<typeof clipBody>
