import process from 'node:process'
import {
  HEARTBEAT_INTERVAL_MS,
  type Heartbeat,
  heartbeatStream,
  type QueueDepth,
  type SourceActivity,
} from '../schema/heartbeat'

type Producer = {
  publish: (stream: string, payload: unknown) => Promise<unknown>
}

export type HeartbeatOptions = {
  service: string
  version: string
  /** Extras worth showing next to the version, e.g. the NVR build. */
  details?: () => Promise<Record<string, string>> | Record<string, string>
  /**
   * Backlog of the streams this service consumes, re-read on every beat —
   * unlike `details`, this is runtime state and stale numbers are useless.
   */
  queues?: () => Promise<QueueDepth[]>
  /**
   * Activity of the NVR source this service owns, re-read on every beat. Only
   * adapters set it; a source that has gone quiet is indistinguishable from a
   * healthy one without it.
   */
  source?: () => SourceActivity
  /**
   * Whether the service's NVR is running a stub detector.
   *
   * Read on every beat, like `source`: a probe that was armed an hour ago and
   * a probe running right now are different facts, and only the second one
   * invalidates everything else on the page.
   */
  probeActive?: () => boolean
}

/**
 * Reports the service on start and every `HEARTBEAT_INTERVAL_MS`.
 * Returns a stop function; the timer is unref'd so it never holds the process.
 */
export const startHeartbeat = (
  producer: Producer,
  { service, version, details, queues, source, probeActive }: HeartbeatOptions,
): (() => void) => {
  const startedAt = Date.now()
  const node = process.env.SPOTTER_MODE ?? 'single'

  // Resolved once: these are build versions, not runtime state. A probe that
  // fails must not cost the heartbeat itself.
  let resolved: Record<string, string> | undefined
  const collect = async (): Promise<Record<string, string> | undefined> => {
    if (!details) return undefined
    resolved ??= await Promise.resolve(details()).catch(() => ({}))
    return Object.keys(resolved).length > 0 ? resolved : undefined
  }

  const beat = async (): Promise<void> => {
    const collected = await collect()
    // A failed probe must not cost the beat: liveness matters more than depth.
    const depths = queues ? await queues().catch(() => []) : []
    // A throwing probe must not cost the beat: liveness matters more.
    let activity: SourceActivity | undefined
    try {
      activity = source?.()
    } catch {
      activity = undefined
    }

    // Same reasoning as `source`: a throwing probe must not cost the beat.
    let probing = false
    try {
      probing = probeActive?.() ?? false
    } catch {
      probing = false
    }

    const payload: Heartbeat = {
      service,
      version,
      node,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      at: Date.now(),
      ...(collected ? { details: collected } : {}),
      ...(depths.length > 0 ? { queues: depths } : {}),
      ...(activity ? { source: activity } : {}),
      // Only when true: false would say "we checked", which is noise on
      // every service that has no detector at all.
      ...(probing ? { probeActive: true } : {}),
    }
    // A failed heartbeat must never take the service down with it.
    await producer.publish(heartbeatStream, payload).catch(() => undefined)
  }

  void beat()
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)
  timer.unref?.()

  return () => clearInterval(timer)
}
