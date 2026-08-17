import { z } from 'zod'

/**
 * Contracts for the abstracted media pipeline.
 *
 * The NVR adapter (sink) is the only component that knows how to reach a
 * concrete NVR. Downstream services (server/bot, depot) speak only these
 * stream contracts:
 *
 *   request  → adapter stages raw bytes into S3 → `staged`
 *   staged   → depot transcodes from S3 by key   → `processed`
 *
 * No URLs, credentials or NVR tokens ever travel on the wire — only S3 keys.
 */

/** Kinds of media a consumer can ask an adapter to stage for an event. */
export const mediaWantSchema = z.enum(['clip', 'snapshot'])
export type MediaWant = z.infer<typeof mediaWantSchema>

// --- Event media: request → staged → processed ----------------------------

/**
 * Asks the `<source>` adapter to fetch and stage the requested media for an
 * event. Routed to the per-source stream `spotter.media.request.<source>`.
 */
export const mediaRequestSchema = z.object({
  eventId: z.string().min(1),
  source: z.string().min(1),
  want: z.array(mediaWantSchema).min(1),
})
export type MediaRequest = z.infer<typeof mediaRequestSchema>

/**
 * Adapter has staged the raw bytes into S3 under the given keys. Published to
 * `spotter.media.staged`; consumed by depot for transcoding.
 */
export const mediaStagedSchema = z.object({
  eventId: z.string().min(1),
  source: z.string().min(1),
  rawClipKey: z.string().min(1).optional(),
  rawSnapshotKey: z.string().min(1).optional(),
})
export type MediaStaged = z.infer<typeof mediaStagedSchema>

/**
 * Depot has transcoded the staged media and stored the result in S3. Published
 * to `spotter.event.media_processed`; replaces the legacy url-based payload.
 */
export const mediaProcessedSchema = z.object({
  eventId: z.string().min(1),
  clipKey: z.string().min(1).optional(),
  snapshotKey: z.string().min(1).optional(),
})
export type MediaProcessed = z.infer<typeof mediaProcessedSchema>

/** Progress of an event's media. Success is `mediaProcessed`, not a stage. */
export const mediaStageSchema = z.enum(['fetching', 'staged', 'failed'])
export type MediaStage = z.infer<typeof mediaStageSchema>

export const mediaProgressSchema = z.object({
  eventId: z.string().min(1),
  stage: mediaStageSchema,
  /** Short human-readable cause, only for `failed`. */
  reason: z.string().optional(),
  /** Transcoding completeness, 0-100. Only sent while `staged`. */
  percent: z.number().int().min(0).max(100).optional(),
})
export type MediaProgress = z.infer<typeof mediaProgressSchema>

// --- Camera frame: request → staged → processed ---------------------------

/**
 * Asks the `<source>` adapter to grab and stage the latest frame of a camera.
 * Routed to `spotter.camera.request.<source>`. `chatId`/`messageId` correlate
 * the eventual frame back to a frontend interaction.
 */
export const cameraRequestSchema = z.object({
  source: z.string().min(1),
  camera: z.string().min(1),
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type CameraRequest = z.infer<typeof cameraRequestSchema>

/**
 * Adapter has staged the raw camera frame into S3. Published to
 * `spotter.camera.staged`; consumed by depot.
 */
export const cameraStagedSchema = z.object({
  source: z.string().min(1),
  camera: z.string().min(1),
  rawFrameKey: z.string().min(1),
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type CameraStaged = z.infer<typeof cameraStagedSchema>

/**
 * Depot has processed the camera frame and stored the result in S3. Published
 * to `spotter.camera.frame_processed`.
 */
export const cameraProcessedSchema = z.object({
  camera: z.string().min(1),
  frameKey: z.string().min(1),
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type CameraProcessed = z.infer<typeof cameraProcessedSchema>

// --- Stream names ----------------------------------------------------------

/**
 * Canonical stream names for the media pipeline. Per-source request streams are
 * derived via the helpers so the `<source>` routing key stays consistent.
 */
export const mediaStreams = {
  /** `spotter.media.request.<source>` — event media requests, per source. */
  mediaRequest: (source: string): string => `spotter.media.request.${source}`,
  /** `spotter.media.staged` — raw event media staged in S3. */
  mediaStaged: 'spotter.media.staged',
  /** `spotter.event.media_processed` — transcoded event media in S3. */
  mediaProcessed: 'spotter.event.media_processed',
  /** `spotter.media.progress` — how far along an event's media is. */
  mediaProgress: 'spotter.media.progress',
  /** `spotter.camera.request.<source>` — camera frame requests, per source. */
  cameraRequest: (source: string): string => `spotter.camera.request.${source}`,
  /** `spotter.camera.staged` — raw camera frame staged in S3. */
  cameraStaged: 'spotter.camera.staged',
  /** `spotter.camera.frame_processed` — transcoded camera frame in S3. */
  cameraProcessed: 'spotter.camera.frame_processed',
} as const

/** Throws `ZodError` on invalid input. Use when producing the contract. */
export const parseMediaRequest = (value: unknown): MediaRequest =>
  mediaRequestSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseMediaRequest = (value: unknown): MediaRequest | null => {
  const result = mediaRequestSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseMediaStaged = (value: unknown): MediaStaged | null => {
  const result = mediaStagedSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseMediaProcessed = (
  value: unknown,
): MediaProcessed | null => {
  const result = mediaProcessedSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseMediaProgress = (
  value: unknown,
): MediaProgress | null => {
  const result = mediaProgressSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseCameraRequest = (
  value: unknown,
): CameraRequest | null => {
  const result = cameraRequestSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseCameraStaged = (value: unknown): CameraStaged | null => {
  const result = cameraStagedSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseCameraProcessed = (
  value: unknown,
): CameraProcessed | null => {
  const result = cameraProcessedSchema.safeParse(value)
  return result.success ? result.data : null
}
