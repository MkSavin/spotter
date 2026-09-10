import { z } from 'zod'

// request → adapter stages into S3 → staged → depot transcodes → processed.
// Only S3 keys travel on the wire, never URLs or NVR credentials.

/** Kinds of media a consumer can ask an adapter to stage for an event. */
export const mediaWantSchema = z.enum(['clip', 'snapshot'])
export type MediaWant = z.infer<typeof mediaWantSchema>

// --- Event media: request → staged → processed ----------------------------

/**
 * Routed to `spotter.media.request.<source>`. `camera`/`startTime` let the
 * adapter find the event in the recording; see docs/foundings/frigate-event-media.md.
 */
export const mediaRequestSchema = z.object({
  eventId: z.string().min(1),
  source: z.string().min(1),
  want: z.array(mediaWantSchema).min(1),
  camera: z.string().min(1).optional(),
  startTime: z.number().optional(),
  endTime: z.number().nullable().optional(),
  snapshotAbsent: z.boolean().optional(),
})
export type MediaRequest = z.infer<typeof mediaRequestSchema>

/** Published to `spotter.media.staged`; consumed by depot. */
export const mediaStagedSchema = z.object({
  eventId: z.string().min(1),
  source: z.string().min(1),
  rawClipKey: z.string().min(1).optional(),
  rawSnapshotKey: z.string().min(1).optional(),
})
export type MediaStaged = z.infer<typeof mediaStagedSchema>

/** Published to `spotter.event.media_processed`. */
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
 * Routed to `spotter.camera.request.<source>`; the ids correlate the frame
 * back to a frontend interaction.
 */
export const cameraRequestSchema = z.object({
  source: z.string().min(1),
  camera: z.string().min(1),
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type CameraRequest = z.infer<typeof cameraRequestSchema>

/** Published to `spotter.camera.staged`; consumed by depot. */
export const cameraStagedSchema = z.object({
  source: z.string().min(1),
  camera: z.string().min(1),
  rawFrameKey: z.string().min(1),
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type CameraStaged = z.infer<typeof cameraStagedSchema>

/** Published to `spotter.camera.frame_processed`. */
export const cameraProcessedSchema = z.object({
  camera: z.string().min(1),
  frameKey: z.string().min(1),
  chatId: z.number().optional(),
  messageId: z.number().optional(),
})
export type CameraProcessed = z.infer<typeof cameraProcessedSchema>

// --- Stream names ----------------------------------------------------------

/** Per-source streams go through the helpers so the routing key stays consistent. */
export const mediaStreams = {
  /** `spotter.media.request.<source>` — event media requests, per source. */
  mediaRequest: (source: string): string => `spotter.media.request.${source}`,
  /**
   * Split from clips so a burst of long transcodes cannot starve snapshots:
   * a replica subscribes to one stream and never sees the other.
   */
  mediaStaged: 'spotter.media.staged',
  /** `spotter.media.staged.clip` — raw event clip staged in S3 (slow lane). */
  mediaStagedClip: 'spotter.media.staged.clip',
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
