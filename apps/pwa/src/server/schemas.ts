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

/** Asks for an event's clip to be fetched and transcoded. */
export const clipBody = z.object({
  eventId: z.string().min(1).max(128),
})
export type ClipBody = z.infer<typeof clipBody>
