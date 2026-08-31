import { z } from 'zod'

/**
 * Contracts for timelapse exports.
 *
 * Unlike a snapshot or a clip, an export is not something the NVR hands over on
 * request: it re-encodes hours of recordings and can run for minutes. So the
 * pipeline is split in two — the adapter starts the export and acknowledges
 * immediately, then a poller watches it to completion and stages the result.
 * Holding the request open instead would exceed the regulator's reclaim window
 * and get the whole export started a second time.
 */

/**
 * Playback speed. Frigate accepts exactly these two values on the export API;
 * arbitrary factors are a config-level setting (`record.export.timelapse_args`)
 * and cannot be varied per request.
 */
export const timelapseSpeedSchema = z.enum(['realtime', 'timelapse'])
export type TimelapseSpeed = z.infer<typeof timelapseSpeedSchema>

/**
 * Asks the `<source>` adapter to export a span of recordings. Routed to
 * `spotter.timelapse.request.<source>`; `chatId`/`messageId` correlate the
 * result back to the interaction that asked for it.
 */
export const timelapseRequestSchema = z.object({
  source: z.string().min(1),
  camera: z.string().min(1),
  /** Unix seconds, inclusive. */
  start: z.number().int().positive(),
  /** Unix seconds, exclusive. Always greater than `start`. */
  end: z.number().int().positive(),
  speed: timelapseSpeedSchema,
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type TimelapseRequest = z.infer<typeof timelapseRequestSchema>

/**
 * The export finished and its bytes are staged in S3. Published to
 * `spotter.timelapse.ready`.
 */
export const timelapseReadySchema = z.object({
  source: z.string().min(1),
  camera: z.string().min(1),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  speed: timelapseSpeedSchema,
  videoKey: z.string().min(1),
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type TimelapseReady = z.infer<typeof timelapseReadySchema>

/** Why a timelapse never arrived. Terminal — the requester stops waiting. */
export const timelapseFailureSchema = z.enum([
  /** No recordings cover the requested span. */
  'empty',
  /** The NVR refused or the export errored out. */
  'rejected',
  /** Started but never reached a usable file within the deadline. */
  'timeout',
])
export type TimelapseFailure = z.infer<typeof timelapseFailureSchema>

/** Published to `spotter.timelapse.failed` when an export cannot be delivered. */
export const timelapseFailedSchema = z.object({
  source: z.string().min(1),
  camera: z.string().min(1),
  reason: timelapseFailureSchema,
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type TimelapseFailed = z.infer<typeof timelapseFailedSchema>

export const timelapseStreams = {
  /** `spotter.timelapse.request.<source>` — export requests, per source. */
  request: (source: string): string => `spotter.timelapse.request.${source}`,
  /** `spotter.timelapse.ready` — exported video staged in S3. */
  ready: 'spotter.timelapse.ready',
  /** `spotter.timelapse.failed` — the export will never arrive. */
  failed: 'spotter.timelapse.failed',
} as const

export const safeParseTimelapseRequest = (
  value: unknown,
): TimelapseRequest | null => {
  const result = timelapseRequestSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseTimelapseReady = (
  value: unknown,
): TimelapseReady | null => {
  const result = timelapseReadySchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseTimelapseFailed = (
  value: unknown,
): TimelapseFailed | null => {
  const result = timelapseFailedSchema.safeParse(value)
  return result.success ? result.data : null
}
