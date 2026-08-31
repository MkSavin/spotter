/**
 * Describes how to fetch a single media artifact from the NVR: a ready-to-send
 * `Request` carrying the URL and any auth headers (e.g. a minted NVR JWT). The
 * runtime performs the fetch and streams the body into S3 — credentials never
 * leave the adapter process.
 */
export type MediaFetch = Request

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
   */
  resolveEventFrame?(
    eventId: string,
  ): MediaFetch | null | Promise<MediaFetch | null>
  /** Resolve the latest frame for a camera. */
  resolveFrame(camera: string): MediaFetch | null | Promise<MediaFetch | null>
}
