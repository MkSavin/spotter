import type { TimelapseSpeed } from '@spotter/transport'
import type { MediaFetch } from '../media/MediaProvider'

/** A span of recordings to export, in unix seconds. */
export type TimelapseSpan = {
  camera: string
  start: number
  end: number
  speed: TimelapseSpeed
}

/** Handle to an export the NVR has accepted and is now producing. */
export type TimelapseJob = {
  /** NVR-assigned id, used to poll for completion. */
  id: string
}

/** Outcome of one poll of a running export. */
export type TimelapseProgress =
  | { state: 'running' }
  /** Finished; `fetch` downloads the resulting video. */
  | { state: 'ready'; fetch: MediaFetch }
  /** The NVR no longer knows about this export — it will never finish. */
  | { state: 'lost' }

/**
 * Port for NVRs that can export a span of recordings as a single video.
 *
 * Kept separate from `MediaProvider` because the shape of the interaction is
 * different: an export is started, then polled, then downloaded, and it may
 * outlive the request that asked for it. Adapters whose NVR cannot do this
 * simply do not implement it.
 */
export interface TimelapseProvider {
  /** Starts an export. Returns `null` when the NVR declines the span. */
  startExport(span: TimelapseSpan): Promise<TimelapseJob | null>
  /** Checks one running export. */
  pollExport(jobId: string): Promise<TimelapseProgress>
  /** Best-effort removal of the finished export from the NVR's own storage. */
  discardExport(jobId: string): Promise<void>
}
