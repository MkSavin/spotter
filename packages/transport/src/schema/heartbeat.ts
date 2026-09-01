import { z } from 'zod'

/**
 * How much work a service's consumer group is sitting on, per stream.
 *
 * `lag` is the number of entries never handed to anyone — the honest measure of
 * "is this service keeping up", and the one an autoscaler wants. `pending` is
 * work already claimed but not yet acked; a small number is normal traffic, a
 * growing one means handlers are failing or stuck. `oldestPendingMs` separates
 * those two cases: a backlog that is merely large clears, one that is old does
 * not.
 */
export const queueDepthSchema = z.object({
  stream: z.string().min(1),
  lag: z.number().nonnegative(),
  pending: z.number().nonnegative(),
  /** Age of the oldest unacked entry; absent when nothing is pending. */
  oldestPendingMs: z.number().nonnegative().optional(),
})
export type QueueDepth = z.infer<typeof queueDepthSchema>

/**
 * Liveness and version report from a single service.
 *
 * Every service announces itself on start and then on a timer. Consumers keep
 * the latest report per service and treat a stale one as "not reporting" — a
 * crashed service stops sending rather than announcing its own death.
 *
 * Carried on a stream, not a key: keys do not cross the forwarder, so a
 * cloud-side consumer would never see reports from the ingest node.
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
  /**
   * Depth of every stream this service consumes. Absent for services that
   * consume nothing, and omitted entirely when all queues are empty — the
   * common case, and not worth the bytes on every beat.
   */
  queues: z.array(queueDepthSchema).optional(),
})
export type Heartbeat = z.infer<typeof heartbeatSchema>

export const heartbeatStream = 'spotter.heartbeat'

/** How often services report. Consumers allow a couple of misses. */
export const HEARTBEAT_INTERVAL_MS = 30_000

/** Reports older than this count as offline. */
export const HEARTBEAT_STALE_MS = HEARTBEAT_INTERVAL_MS * 3

/** Throws `ZodError` on invalid input. Use when producing. */
export const parseHeartbeat = (value: unknown): Heartbeat =>
  heartbeatSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseHeartbeat = (value: unknown): Heartbeat | null => {
  const result = heartbeatSchema.safeParse(value)
  return result.success ? result.data : null
}
