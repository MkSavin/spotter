import type { RedisClient } from 'bun'

/**
 * Bun's `RedisClient.connect()` does not reject promptly when the host is
 * unreachable (e.g. a Docker-only `redis` hostname used on the host): it keeps
 * retrying in the background, and if nothing else holds the event loop open the
 * process then exits silently with code 0 — no error, no logs. Racing the
 * connect against a timeout turns that silent death into a loud, debuggable
 * failure.
 */
export const connectRedis = async (
  client: RedisClient,
  options: { url?: string; timeoutMs?: number } = {},
): Promise<void> => {
  if (client.connected) {
    return
  }

  const timeoutMs = options.timeoutMs ?? 10000
  const where = options.url ? ` (${options.url})` : ''

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Redis connection timed out after ${timeoutMs}ms${where}. Is Redis reachable?`,
        ),
      )
    }, timeoutMs)
  })

  try {
    await Promise.race([client.connect(), timeout])
  } finally {
    clearTimeout(timer)
  }
}
