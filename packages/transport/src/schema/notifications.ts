import { z } from 'zod'

/**
 * Contract for suspending an NVR's own notifications.
 *
 * Distinct from a frontend's mute: that silences one chat and is ours to
 * enforce, while this asks the NVR to stop announcing a camera at all — which
 * every consumer feels. Modelled as a request to the adapter because only it
 * knows how its NVR expresses the idea (Frigate: a retained MQTT publish).
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
