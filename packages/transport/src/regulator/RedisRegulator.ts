import type { RedisClient } from 'bun'
import type { Stenograph } from 'stenograph'
import { connectRedis } from '../helpers/connectRedis'
import { RedisConnection } from '../helpers/RedisConnection'
import {
  parseEntries,
  parsePendingReply,
  parseReadGroupReply,
  type StreamMessage,
  type StreamRecord,
} from './parseStreamReply'

export type { StreamMessage } from './parseStreamReply'

// A durable Redis replaying its AOF can take a minute; 60 x 2s covers that
// without hanging a genuinely broken startup forever.
const GROUP_LOADING_RETRIES = 60
const GROUP_LOADING_DELAY_MS = 2000

export type StreamMessagePayload = {
  topic: string
  message: StreamMessage
}

export type StreamMessageController<Context> = (
  payload: StreamMessagePayload,
  context: Context,
) => Promise<void>

export type RegulatorOptions = {
  group: string
  consumer: string
  blockMs?: number
  count?: number
  reclaimMinIdleMs?: number
  reaperIntervalMs?: number
  /**
   * After this many failed deliveries an entry is treated as poison: moved to
   * `<stream>.dead` and acked instead of being retried forever.
   */
  maxDeliveries?: number
  /** Delay between XGROUP retries while Redis replays its AOF. Tests shorten it. */
  loadingRetryDelayMs?: number
}

export type RegulatorHandle = {
  stop: () => Promise<void>
  /** Streams this regulator consumes — the set to report depth for. */
  streams: string[]
}

type BaseContext = {
  subscriber: RedisClient | RedisConnection
  producer: StreamProducer
  logger: Stenograph
}

/**
 * Thin wrapper over a Bun RedisClient used for non-blocking writes: XADD from
 * controllers plus admin commands (XGROUP/XACK/XCLAIM) from the regulator. Kept
 * separate from the subscriber connection so a blocking XREADGROUP never stalls
 * publishing.
 */
export class StreamProducer {
  private connected = false

  constructor(
    private readonly client: RedisClient | RedisConnection,
    private readonly maxLen = 10000,
  ) {}

  async connect(): Promise<void> {
    if (this.connected || this.client.connected) {
      this.connected = true
      return
    }
    if (this.client instanceof RedisConnection) {
      await this.client.connect()
    } else {
      await connectRedis(this.client)
    }
    this.connected = true
  }

  disconnect(): void {
    this.client.close()
    this.connected = false
  }

  async publish(stream: string, payload: unknown): Promise<string> {
    return this.send('XADD', [
      stream,
      'MAXLEN',
      '~',
      String(this.maxLen),
      '*',
      'value',
      JSON.stringify(payload),
    ]) as Promise<string>
  }

  /** Low-level passthrough for the regulator's admin commands. */
  send(command: string, args: string[]): Promise<unknown> {
    return this.client.send(command, args)
  }
}

/**
 * Redis replaying an AOF/RDB answers every command with `-LOADING` until it is
 * done, which on a restart of a durable instance can take a while. Treating
 * that as fatal killed the service on exactly the restart it was meant to
 * survive, so the group creation waits it out instead.
 */
/** Marks a read that never came back, so the loop can tell it apart. */
const STALLED_READ = 'spotter: read stalled'

/**
 * How long past `BLOCK` a read may take before it counts as stalled. Covers
 * the round trip and a slow server without misreading an ordinary empty read.
 */
const READ_DEADLINE_GRACE_MS = 5_000

const createGroup = async (
  producer: StreamProducer,
  stream: string,
  group: string,
  delayMs: number,
): Promise<void> => {
  for (let attempt = 0; ; attempt++) {
    try {
      await producer.send('XGROUP', ['CREATE', stream, group, '$', 'MKSTREAM'])
      return
    } catch (error) {
      const message = String((error as Error)?.message ?? error)
      // The group already exists — the normal case on every restart.
      if (message.includes('BUSYGROUP')) return
      if (!message.includes('LOADING') || attempt >= GROUP_LOADING_RETRIES) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

export class RedisRegulator<Context extends BaseContext> {
  subscribers: Record<string, StreamMessageController<Context>> = {}

  message(stream: string, callback: StreamMessageController<Context>): this {
    this.subscribers[stream] = callback
    return this
  }

  get streams(): string[] {
    return Object.keys(this.subscribers)
  }

  /**
   * Starts consuming WITHOUT blocking the caller: groups are created, a startup
   * reclaim runs once, a periodic reaper is scheduled, and the read loop is left
   * running detached. Open connections keep the process alive.
   *
   * @returns a handle whose `stop()` halts the loop and reaper (connections are
   * closed by the caller).
   */
  async run(
    context: Context,
    options: RegulatorOptions,
  ): Promise<RegulatorHandle> {
    const { subscriber, producer, logger } = context
    const log = logger.sub('transport')

    const { group, consumer } = options
    const blockMs = options.blockMs ?? 5000
    const count = options.count ?? 10
    const minIdleMs = options.reclaimMinIdleMs ?? 300000
    const reaperIntervalMs = options.reaperIntervalMs ?? 60000
    const maxDeliveries = options.maxDeliveries ?? 5
    const streams = this.streams

    await producer.connect()

    const loadingDelayMs = options.loadingRetryDelayMs ?? GROUP_LOADING_DELAY_MS

    for (const stream of streams) {
      await createGroup(producer, stream, group, loadingDelayMs)
    }

    const dispatch = async (record: StreamRecord): Promise<void> => {
      const handler = this.subscribers[record.topic]

      if (!handler) {
        // No handler (e.g. a renamed stream) — ack so it doesn't pile up in PEL.
        await producer.send('XACK', [record.topic, group, record.message.id])
        return
      }

      try {
        await handler({ topic: record.topic, message: record.message }, context)
        await producer.send('XACK', [record.topic, group, record.message.id])
      } catch (error) {
        // Leave the entry pending — the reaper will reclaim and retry it.
        log.error(error)
      }
    }

    // Poison message: it has failed too many times. Move the body to a dead-
    // letter stream for inspection and ack the original so it stops cycling.
    const deadLetter = async (
      stream: string,
      id: string,
      deliveries: number,
    ): Promise<void> => {
      const range = await producer.send('XRANGE', [stream, id, id])
      const value = parseEntries(stream, range).at(0)?.message.value ?? ''

      await producer.send('XADD', [
        `${stream}.dead`,
        '*',
        'value',
        value,
        'reason',
        'max-deliveries-exceeded',
        'deliveries',
        String(deliveries),
        'stream',
        stream,
        'originalId',
        id,
      ])
      await producer.send('XACK', [stream, group, id])

      log.warn(
        `Poison message ${stream}/${id} (deliveries=${deliveries}) moved to ${stream}.dead`,
      )
    }

    // Reclaim entries idle longer than minIdleMs (crashed/stuck consumers).
    // XPENDING carries the delivery count, so poison messages are diverted to
    // the DLQ before they are re-dispatched; everything else is XCLAIM'd to this
    // consumer and retried.
    const reclaim = async (): Promise<void> => {
      for (const stream of streams) {
        const pending = parsePendingReply(
          await producer.send('XPENDING', [
            stream,
            group,
            'IDLE',
            String(minIdleMs),
            '-',
            '+',
            String(count),
          ]),
        )

        for (const { id, deliveries } of pending) {
          // `deliveries` counts attempts already made, so `>=` diverts the entry
          // once it has burned its budget rather than granting one extra run.
          if (deliveries >= maxDeliveries) {
            await deadLetter(stream, id, deliveries)
            continue
          }

          const claimed = await producer.send('XCLAIM', [
            stream,
            group,
            consumer,
            String(minIdleMs),
            id,
          ])
          for (const record of parseEntries(stream, claimed)) {
            await dispatch(record)
          }
        }
      }
    }

    await reclaim().catch((error) => log.error(error))

    let reaping = false
    const reaper = setInterval(() => {
      if (reaping) {
        return
      }
      reaping = true
      reclaim()
        .catch((error) => log.error(error))
        .finally(() => {
          reaping = false
        })
    }, reaperIntervalMs)

    let running = true
    const readArgs = [
      'GROUP',
      group,
      consumer,
      'COUNT',
      String(count),
      'BLOCK',
      String(blockMs),
      'STREAMS',
      ...streams,
      ...streams.map(() => '>'),
    ]

    /**
     * A blocking read that is in flight when the server dies never settles —
     * it neither resolves nor rejects, so awaiting it parks the loop forever
     * and no error is ever raised to recover from. The process stays healthy
     * to every outside check while consuming nothing at all.
     *
     * The deadline turns that silence into an error the loop can act on. It is
     * generous relative to `BLOCK`: a read that merely found nothing returns
     * on its own well before this fires.
     */
    const readDeadlineMs = blockMs + READ_DEADLINE_GRACE_MS

    const readWithDeadline = async (): Promise<unknown> => {
      let timer: ReturnType<typeof setTimeout> | undefined

      try {
        return await Promise.race([
          subscriber.send('XREADGROUP', readArgs),
          new Promise((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error(STALLED_READ)),
              readDeadlineMs,
            )
          }),
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    const loop = async (): Promise<void> => {
      while (running) {
        try {
          const reply = await readWithDeadline()
          for (const record of parseReadGroupReply(reply)) {
            await dispatch(record)
          }
        } catch (error) {
          if (!running) {
            break
          }

          const message = String((error as Error)?.message ?? error)

          // The connection is wedged rather than erroring. Replacing the client
          // is the only way back: the old one is attached to a socket whose
          // server no longer exists and will never answer.
          if (message.includes(STALLED_READ)) {
            log.warn('Read stalled — replacing the connection')
            if (subscriber instanceof RedisConnection) {
              await subscriber
                .replace(error)
                .catch((replaceError) => log.error(replaceError))
            }
            continue
          }

          // A Redis that came back empty (lost volume, FLUSHALL) has no groups,
          // and every read fails the same way until they are made again.
          if (message.includes('NOGROUP')) {
            log.warn('Consumer group missing — recreating')
            for (const stream of streams) {
              await createGroup(producer, stream, group, loadingDelayMs).catch(
                (retryError) => log.error(retryError),
              )
            }
            continue
          }

          log.error(error)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    const looping = loop()

    return {
      streams,
      stop: async () => {
        running = false
        clearInterval(reaper)
        await looping.catch(() => {})
      },
    }
  }
}
