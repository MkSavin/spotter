import { randomBytes } from 'node:crypto'
import {
  type CommandReply,
  type CommandRequest,
  deliveryStreams,
  type StreamProducer,
  safeParseCommandReply,
} from '@spotter/transport'
import type { RedisClient } from 'bun'
import type { Stenograph } from 'stenograph'

const COMMAND_TIMEOUT_MS = 30_000
const POLL_BLOCK_MS = 2_000

export type CommandBusOptions = {
  /** How long `send` waits for a correlated reply before giving up. */
  timeoutMs?: number
  /** How long each XREAD blocks; shorten it to keep tests quick. */
  pollBlockMs?: number
}

/**
 * Sends domain-mutating commands from telegram to server and awaits the
 * correlated reply on `spotter.command.reply`.
 *
 * A single background reader loop polls the reply stream and dispatches
 * replies to waiting promise callbacks keyed by requestId. Telegram
 * instances that run concurrently each use their own `instanceId`, so they
 * can share the same reply stream without stealing each other's replies.
 */
export class CommandBus {
  private readonly instanceId: string
  private readonly pending = new Map<string, (reply: CommandReply) => void>()
  private readonly timeoutMs: number
  private readonly pollBlockMs: number
  private replyOffset = '$'
  private running = false

  constructor(
    private readonly producer: StreamProducer,
    private readonly subscriber: RedisClient,
    private readonly logger: Stenograph,
    options: CommandBusOptions = {},
  ) {
    this.instanceId = randomBytes(8).toString('hex')
    this.timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS
    this.pollBlockMs = options.pollBlockMs ?? POLL_BLOCK_MS
  }

  /** Start the background reply poller. Call once after Redis connects. */
  start(): void {
    if (this.running) return
    this.running = true
    this.pollLoop().catch((err) =>
      this.logger.error('CommandBus poll loop crashed', err),
    )
  }

  stop(): void {
    this.running = false
  }

  /**
   * Publishes `kind` with `args` and waits `timeoutMs` for the server reply.
   * Throws on timeout or if the server returns ok=false with an error.
   */
  async send(
    kind: string,
    args: Record<string, unknown> = {},
    principalUuid?: string,
  ): Promise<CommandReply> {
    const requestId = randomBytes(16).toString('hex')

    const request: CommandRequest = {
      requestId,
      instanceId: this.instanceId,
      kind,
      args,
      principalUuid,
    }

    const replyPromise = new Promise<CommandReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(
          new Error(`Command "${kind}" timed out after ${this.timeoutMs}ms`),
        )
      }, this.timeoutMs)

      this.pending.set(requestId, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
    })

    await this.producer.publish(deliveryStreams.commandRequest, request)

    return replyPromise
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        // Bun's RedisClient speaks RESP3
        const result = (await this.subscriber.send('XREAD', [
          'COUNT',
          '100',
          'BLOCK',
          String(this.pollBlockMs),
          'STREAMS',
          deliveryStreams.commandReply,
          this.replyOffset,
        ])) as Record<string, [string, string[]][]> | null

        if (!result) continue

        for (const entries of Object.values(result)) {
          for (const [id, fields] of entries) {
            this.replyOffset = id

            const obj: Record<string, string> = {}
            for (let i = 0; i < fields.length; i += 2) {
              obj[fields[i]] = fields[i + 1]
            }

            const valueStr = obj.value
            if (!valueStr) continue

            let parsed: unknown
            try {
              parsed = JSON.parse(valueStr)
            } catch {
              continue
            }

            const reply = safeParseCommandReply(parsed)
            if (!reply) continue

            const handler = this.pending.get(reply.requestId)
            if (handler) {
              this.pending.delete(reply.requestId)
              handler(reply)
            }
          }
        }
      } catch (error) {
        if (this.running) {
          this.logger.warn('CommandBus poll error', error)
        }
      }
    }
  }
}
