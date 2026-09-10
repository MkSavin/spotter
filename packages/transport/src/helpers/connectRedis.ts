import type { RedisClient } from 'bun'

/**
 * Raced against a timeout: an unreachable host otherwise exits the process
 * silently with code 0. See docs/foundings/redis-streams.md.
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
