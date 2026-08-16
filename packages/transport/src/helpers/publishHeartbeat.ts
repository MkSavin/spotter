import process from 'node:process'
import {
  HEARTBEAT_INTERVAL_MS,
  type Heartbeat,
  heartbeatStream,
} from '../schema/heartbeat'

type Producer = {
  publish: (stream: string, payload: unknown) => Promise<unknown>
}

export type HeartbeatOptions = {
  service: string
  version: string
  /** Extras worth showing next to the version, e.g. the NVR build. */
  details?: () => Promise<Record<string, string>> | Record<string, string>
}

/**
 * Reports the service on start and every `HEARTBEAT_INTERVAL_MS`.
 * Returns a stop function; the timer is unref'd so it never holds the process.
 */
export const startHeartbeat = (
  producer: Producer,
  { service, version, details }: HeartbeatOptions,
): (() => void) => {
  const startedAt = Date.now()
  const node = process.env.SPOTTER_MODE ?? 'single'

  const beat = async (): Promise<void> => {
    const payload: Heartbeat = {
      service,
      version,
      node,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      at: Date.now(),
      ...(details ? { details: await details() } : {}),
    }
    // A failed heartbeat must never take the service down with it.
    await producer.publish(heartbeatStream, payload).catch(() => undefined)
  }

  void beat()
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)
  timer.unref?.()

  return () => clearInterval(timer)
}
