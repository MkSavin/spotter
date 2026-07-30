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
  endpoint: z.string().url(),
  code: z.string().min(1).max(64),
})
export type AuthBody = z.infer<typeof authBody>
