/**
 * Describes how to fetch a single media artifact from the NVR: a ready-to-send
 * `Request` carrying the URL and any auth headers (e.g. a minted NVR JWT). The
 * runtime performs the fetch and streams the body into S3 — credentials never
 * leave the adapter process.
 */
export type MediaFetch = Request

/** Where and when an event happened, enough to locate it in a recording. */
export type EventMoment = {
  camera: string
  startTime: number
  endTime?: number | null
}

/**
 * Port of the old bot-side `NvrEndpoint`. The only component that knows the
 * NVR's URL schemes and auth. Returns `null` when the artifact cannot be
 * resolved (e.g. the NVR doesn't expose it). All NVR credentials live behind
 * this interface and never travel on the wire.
 */
export interface MediaProvider {
  /** Resolve the clip download for an event. */
  resolveClip(eventId: string): MediaFetch | null | Promise<MediaFetch | null>
  /** Resolve the snapshot download for an event. */
  resolveSnapshot(
    eventId: string,
  ): MediaFetch | null | Promise<MediaFetch | null>
  /**
   * Resolve a still from the continuous recording covering the event, for
   * events the NVR never wrote a snapshot for. Optional: adapters without
   * recordings simply omit it.
   *
   * `moment` comes from the event itself so the fallback does not depend on the
   * NVR having caught up: the recording covers the moment long before the event
   * is queryable. Without it the adapter may look the event up, and get nothing
   * for precisely the events this exists to rescue.
   */
  resolveEventFrame?(
    eventId: string,
    moment?: EventMoment,
  ): MediaFetch | null | Promise<MediaFetch | null>
  /** Resolve the latest frame for a camera. */
  resolveFrame(camera: string): MediaFetch | null | Promise<MediaFetch | null>
}
