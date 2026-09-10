/**
 * Optional: an NVR without the concept supplies none and the consumer is
 * never registered. Changes the NVR's behaviour rather than fetching media.
 */
export abstract class NotificationSuspender {
  /**
   * Suspends `camera` for `minutes`, or lifts the suspension when `minutes` is
   * 0. `camera` may be `all`, meaning every camera the source knows.
   */
  abstract suspend(camera: string, minutes: number): Promise<void>
}
