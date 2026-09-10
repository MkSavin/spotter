import { z } from 'zod'

/** Consumer-group backlog per stream. See docs/foundings/silent-failures.md. */
export const queueDepthSchema = z.object({
  stream: z.string().min(1),
  lag: z.number().nonnegative(),
  pending: z.number().nonnegative(),
  /** Age of the oldest unacked entry; absent when nothing is pending. */
  oldestPendingMs: z.number().nonnegative().optional(),
})
export type QueueDepth = z.infer<typeof queueDepthSchema>

/**
 * When an NVR adapter last saw an event from its source.
 * See docs/foundings/silent-failures.md.
 */
export const sourceActivitySchema = z.object({
  /** Source id, e.g. `frigate`. */
  source: z.string().min(1),
  /** Producer clock, epoch ms. Absent when no event has arrived yet. */
  lastEventAt: z.number().positive().optional(),
  /** Housekeeping traffic, not events: silence here means the link is down. */
  lastContactAt: z.number().positive().optional(),
  /** Events seen since the process started. */
  eventCount: z.number().nonnegative(),
  /** Seconds the process has been up, so a consumer can tell young from quiet. */
  since: z.number().nonnegative(),
  /** By the NVR's own counters. Absent when unreadable, which is not "fine". */
  deadCameras: z.array(z.string().min(1)).optional(),
  /** Cameras with video the detector never sees — no event can be produced. */
  stalledCameras: z.array(z.string().min(1)).optional(),
  /** Explains the other fields: media, catalog and counters all fail together. */
  unauthorized: z.boolean().optional(),
  /** Tells "no contact" apart from "never reports contact". */
  reportsContact: z.boolean().optional(),
})
export type SourceActivity = z.infer<typeof sourceActivitySchema>

/**
 * Liveness and version report from one service.
 * See docs/foundings/silent-failures.md.
 */
export const heartbeatSchema = z.object({
  /** Package name without the scope, e.g. `telegram`. */
  service: z.string().min(1),
  version: z.string().min(1),
  /** Which node it runs on, taken from SPOTTER_MODE. */
  node: z.string().min(1),
  /** Seconds since the process started. */
  uptime: z.number().nonnegative(),
  /** Producer clock, epoch ms — consumers compare it against their own. */
  at: z.number().positive(),
  /** Free-form extras: NVR build, ffmpeg, redis server version. */
  details: z.record(z.string(), z.string()).optional(),
  /** Omitted when every queue is empty — the common case. */
  queues: z.array(queueDepthSchema).optional(),
  /** Set only by adapters that own an NVR source; absent everywhere else. */
  source: sourceActivitySchema.optional(),
  /** Detector is a stub: a healthy source then reports staged events only. */
  probeActive: z.boolean().optional(),
})
export type Heartbeat = z.infer<typeof heartbeatSchema>

export const heartbeatStream = 'spotter.heartbeat'

/** How often services report. Consumers allow a couple of misses. */
export const HEARTBEAT_INTERVAL_MS = 30_000

/** Reports older than this count as offline. */
export const HEARTBEAT_STALE_MS = HEARTBEAT_INTERVAL_MS * 3

/** Deliberately generous. See docs/foundings/silent-failures.md. */
export const SOURCE_SILENT_MS = 6 * 60 * 60 * 1000

/**
 * Minutes, not hours: housekeeping does not depend on the cameras.
 * See docs/foundings/silent-failures.md.
 */
export const SOURCE_UNREACHABLE_MS = 15 * 60 * 1000

/** Stronger than `isSourceSilent`: a quiet driveway cannot stop housekeeping. */
export const isSourceUnreachable = (
  activity: SourceActivity,
  now = Date.now(),
  thresholdMs = SOURCE_UNREACHABLE_MS,
): boolean => {
  // Only alarming once we have waited long enough to have heard something.
  if (!activity.lastContactAt)
    return (
      activity.since * 1000 > thresholdMs && activity.reportsContact === true
    )

  return now - activity.lastContactAt > thresholdMs
}

/** A process not up that long yet cannot know, so it never warns. */
export const isSourceSilent = (
  activity: SourceActivity,
  now = Date.now(),
  thresholdMs = SOURCE_SILENT_MS,
): boolean => {
  if (activity.since * 1000 < thresholdMs) return false
  return now - (activity.lastEventAt ?? 0) > thresholdMs
}

/** Throws `ZodError` on invalid input. Use when producing. */
export const parseHeartbeat = (value: unknown): Heartbeat =>
  heartbeatSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseHeartbeat = (value: unknown): Heartbeat | null => {
  const result = heartbeatSchema.safeParse(value)
  return result.success ? result.data : null
}
