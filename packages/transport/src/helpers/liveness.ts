import { writeFileSync } from 'node:fs'

/** Where the liveness marker lives; the compose healthcheck reads the same path. */
export const LIVENESS_PATH = '/tmp/spotter-alive'

/** How often the marker is refreshed. The healthcheck allows several misses. */
export const LIVENESS_INTERVAL_MS = 30_000

export type LivenessOptions = {
  path?: string
  intervalMs?: number
  /**
   * What "healthy" means for this service. Returning false stops the marker
   * from being refreshed, so the healthcheck eventually fails.
   */
  check: () => boolean | Promise<boolean>
}

/**
 * `check` must probe the dependency the service cannot work without.
 * See docs/foundings/redis-streams.md.
 */
export const startLiveness = ({
  path = LIVENESS_PATH,
  intervalMs = LIVENESS_INTERVAL_MS,
  check,
}: LivenessOptions): (() => void) => {
  const touch = async (): Promise<void> => {
    try {
      if (!(await check())) return
      writeFileSync(path, String(Date.now()))
    } catch {
      // A failed probe simply leaves the marker stale — that is the signal.
    }
  }

  void touch()
  const timer = setInterval(() => void touch(), intervalMs)
  timer.unref?.()

  return () => clearInterval(timer)
}
