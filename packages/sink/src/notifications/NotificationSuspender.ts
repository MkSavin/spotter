/**
 * Port for NVRs that can suspend their own notifications for a camera.
 *
 * Optional, like `TimelapseProvider`: an NVR without the concept simply does
 * not supply one, and the consumer is never registered. Separate from
 * `MediaProvider` because it neither fetches nor produces media — it changes
 * the NVR's own behaviour.
 */
export abstract class NotificationSuspender {
  /**
   * Suspends `camera` for `minutes`, or lifts the suspension when `minutes` is
   * 0. `camera` may be `all`, meaning every camera the source knows.
   */
  abstract suspend(camera: string, minutes: number): Promise<void>
}
