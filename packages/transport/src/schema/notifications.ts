import { z } from 'zod'

/**
 * Unlike a frontend mute, this silences the NVR itself and every consumer
 * feels it. Only the adapter knows how its NVR expresses the idea.
 */
export const notificationSuspendSchema = z.object({
  source: z.string().min(1),
  /** Camera code, or `all` to cover every camera the source knows. */
  camera: z.string().min(1),
  /** How long to stay suspended; `0` lifts an active suspension. */
  minutes: z.number().int().min(0),
})

export type NotificationSuspend = z.infer<typeof notificationSuspendSchema>

/** Stream carrying suspend requests to the `<source>` adapter. */
export const notificationStreams = {
  suspend: (source: string): string =>
    `spotter.notifications.suspend.${source}`,
} as const

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseNotificationSuspend = (
  value: unknown,
): NotificationSuspend | null => {
  const result = notificationSuspendSchema.safeParse(value)
  return result.success ? result.data : null
}
