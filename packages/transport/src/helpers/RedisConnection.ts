import { RedisClient } from 'bun'
import { connectRedis } from './connectRedis'

/**
 * Errors that mean the client itself is finished, not that the command was bad.
 * Bun's client enters a terminal state once an outage outlasts its connection
 * timeout: it reports `connected === false` forever and every command fails,
 * even after the server is back. Only a new client recovers.
 */
const isDead = (error: unknown, client: RedisClient): boolean => {
  if (client.connected) return false

  const message = String((error as Error)?.message ?? error)
  return (
    message.includes('Connection has failed') ||
    message.includes('Connection timeout') ||
    message.includes('Connection closed') ||
    message.includes('not connected')
  )
}

/**
 * Owns a `RedisClient` and replaces it when it dies.
 *
 * Reconnecting in place is not an option: a Bun client that has outlived its
 * connection timeout never recovers, which is why restarting the container was
 * the only known cure. Commands run through `send`, which retries once against
 * a freshly built client.
 */
export class RedisConnection {
  private client: RedisClient
  private replacing: Promise<RedisClient> | null = null

  constructor(
    private readonly url: string,
    private readonly onReplace?: (error: unknown) => void,
  ) {
    this.client = new RedisClient(url)
  }

  /** The live client. Callers holding it across an outage may get a stale one. */
  get raw(): RedisClient {
    return this.client
  }

  get connected(): boolean {
    return this.client.connected
  }

  async connect(): Promise<void> {
    await connectRedis(this.client, { url: this.url })
  }

  /**
   * Runs a command, rebuilding the client once if it turned out to be dead.
   * The rebuild waits for the server to come back, so a caller in a retry loop
   * blocks here rather than spinning on a corpse.
   */
  async send(command: string, args: string[]): Promise<unknown> {
    try {
      return await this.client.send(command, args)
    } catch (error) {
      if (!isDead(error, this.client)) throw error

      await this.replace(error)
      return this.client.send(command, args)
    }
  }

  /** Swaps in a new client; concurrent callers share one replacement. */
  async replace(reason?: unknown): Promise<RedisClient> {
    this.replacing ??= this.build(reason).finally(() => {
      this.replacing = null
    })
    return this.replacing
  }

  private async build(reason?: unknown): Promise<RedisClient> {
    this.onReplace?.(reason)

    const previous = this.client
    const fresh = new RedisClient(this.url)

    await connectRedis(fresh, { url: this.url })

    this.client = fresh
    // After the swap: closing first would race commands still using it.
    try {
      previous.close()
    } catch {}

    return fresh
  }

  close(): void {
    this.client.close()
  }
}
