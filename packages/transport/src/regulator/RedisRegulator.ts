import type { RedisClient } from 'bun'
import type { Stenograph } from 'stenograph'
import {
  type StreamMessage,
  type StreamRecord,
  parseAutoclaimReply,
  parseReadGroupReply,
} from './parseStreamReply'

export type { StreamMessage } from './parseStreamReply'

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
}

export type RegulatorHandle = {
  stop: () => Promise<void>
}

type BaseContext = {
  subscriber: RedisClient
  producer: StreamProducer
  logger: Stenograph
}

// Thin wrapper over a Bun RedisClient used for non-blocking writes: XADD from
// controllers plus admin commands (XGROUP/XACK/XAUTOCLAIM) from the regulator.
// Kept separate from the subscriber connection so a blocking XREADGROUP never
// stalls publishing.
export class StreamProducer {
  private connected = false

  constructor(
    private readonly client: RedisClient,
    private readonly maxLen = 10000,
  ) {}

  async connect(): Promise<void> {
    if (this.connected || this.client.connected) {
      this.connected = true
      return
    }
    await this.client.connect()
    this.connected = true
  }

  disconnect(): void {
    this.client.close()
    this.connected = false
  }

  async publish(stream: string, payload: unknown): Promise<string> {
    return this.client.send('XADD', [
      stream,
      'MAXLEN',
      '~',
      String(this.maxLen),
      '*',
      'value',
      JSON.stringify(payload),
    ]) as Promise<string>
  }

  // Low-level passthrough for the regulator's admin commands.
  send(command: string, args: string[]): Promise<unknown> {
    return this.client.send(command, args)
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

  // Starts consuming WITHOUT blocking the caller: groups are created, a startup
  // reclaim runs once, a periodic reaper is scheduled, and the read loop is left
  // running detached. Open connections keep the process alive. Returns a handle
  // whose stop() halts the loop and reaper (connections are closed by the caller).
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
    const streams = this.streams

    await producer.connect()

    for (const stream of streams) {
      try {
        await producer.send('XGROUP', [
          'CREATE',
          stream,
          group,
          '$',
          'MKSTREAM',
        ])
      } catch (error) {
        // BUSYGROUP just means the group already exists — anything else is fatal.
        const message = String((error as Error)?.message ?? error)
        if (!message.includes('BUSYGROUP')) {
          throw error
        }
      }
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

    // Reclaim entries idle longer than minIdleMs (crashed/stuck consumers).
    const reclaim = async (): Promise<void> => {
      for (const stream of streams) {
        let cursor = '0-0'
        do {
          const reply = await producer.send('XAUTOCLAIM', [
            stream,
            group,
            consumer,
            String(minIdleMs),
            cursor,
            'COUNT',
            String(count),
          ])
          const parsed = parseAutoclaimReply(stream, reply)
          for (const record of parsed.messages) {
            await dispatch(record)
          }
          cursor = parsed.cursor
        } while (cursor !== '0-0')
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

    const loop = async (): Promise<void> => {
      while (running) {
        try {
          const reply = await subscriber.send('XREADGROUP', readArgs)
          for (const record of parseReadGroupReply(reply)) {
            await dispatch(record)
          }
        } catch (error) {
          if (!running) {
            break
          }
          log.error(error)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    const looping = loop()

    return {
      stop: async () => {
        running = false
        clearInterval(reaper)
        await looping.catch(() => {})
      },
    }
  }
}
