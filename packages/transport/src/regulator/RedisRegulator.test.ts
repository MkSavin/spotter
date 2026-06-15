import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { RedisClient } from 'bun'
import type { Stenograph } from 'stenograph'
import {
  RedisRegulator,
  type StreamMessagePayload,
  StreamProducer,
} from './RedisRegulator'

/** A handler mock whose recorded calls expose the dispatched payload. */
const handlerMock = () =>
  mock(async (_payload: StreamMessagePayload) => undefined)

type Reply = unknown
type ReplyHandler = (args: string[]) => Reply

/**
 * Minimal stand-in for Bun's `RedisClient`. Records every command and answers
 * with a per-command handler so a test can stage XPENDING/XRANGE/XCLAIM replies
 * without a live Redis.
 */
class FakeRedis {
  connected = false
  readonly calls: { command: string; args: string[] }[] = []
  private readonly handlers: Record<string, ReplyHandler> = {}

  async connect(): Promise<void> {
    this.connected = true
  }

  close(): void {
    this.connected = false
  }

  send(command: string, args: string[]): Promise<Reply> {
    this.calls.push({ command, args })
    const handler = this.handlers[command]
    return Promise.resolve(handler ? handler(args) : null)
  }

  on(command: string, handler: ReplyHandler): this {
    this.handlers[command] = handler
    return this
  }

  callsOf(command: string): string[][] {
    return this.calls.filter((c) => c.command === command).map((c) => c.args)
  }
}

const silentLogger = () =>
  ({
    sub: () => ({
      error: mock(() => undefined),
      warn: mock(() => undefined),
    }),
  }) as unknown as Stenograph

/** Wraps a single staged batch as a RESP2 XREADGROUP reply, then blocks. */
const stagedSubscriber = (batch: Reply) => {
  const redis = new FakeRedis()
  let delivered = false
  redis.on('XREADGROUP', () => {
    if (delivered) {
      return new Promise((resolve) => setTimeout(() => resolve([]), 5))
    }
    delivered = true
    return batch
  })
  return redis
}

const entry = (id: string, value: unknown) => [
  id,
  ['value', JSON.stringify(value)],
]

const buildContext = (subscriber: FakeRedis, producerClient: FakeRedis) => {
  const producer = new StreamProducer(producerClient as unknown as RedisClient)
  return {
    subscriber: subscriber as unknown as RedisClient,
    producer,
    logger: silentLogger(),
  }
}

const handles: { stop: () => Promise<void> }[] = []

afterEach(async () => {
  while (handles.length) {
    await handles.pop()?.stop()
  }
})

describe('StreamProducer', () => {
  test('publish issues a capped XADD with the JSON payload', async () => {
    const client = new FakeRedis().on('XADD', () => '1-0')
    const producer = new StreamProducer(client as unknown as RedisClient, 500)

    const id = await producer.publish('spotter.event', { id: 'e1' })

    expect(id).toBe('1-0')
    expect(client.callsOf('XADD')[0]).toEqual([
      'spotter.event',
      'MAXLEN',
      '~',
      '500',
      '*',
      'value',
      '{"id":"e1"}',
    ])
  })
})

describe('RedisRegulator dispatch', () => {
  test('acks an entry after its handler succeeds', async () => {
    const subscriber = stagedSubscriber([
      ['spotter.event', [entry('5-0', { id: 'e5' })]],
    ])
    const producerClient = new FakeRedis()
    const handler = handlerMock()

    const handle = await new RedisRegulator()
      .message('spotter.event', handler)
      .run(buildContext(subscriber, producerClient), {
        group: 'g',
        consumer: 'c',
        reaperIntervalMs: 999999,
      })
    handles.push(handle)

    await Bun.sleep(20)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toEqual({
      topic: 'spotter.event',
      message: { id: '5-0', value: '{"id":"e5"}' },
    })
    expect(producerClient.callsOf('XACK')).toContainEqual([
      'spotter.event',
      'g',
      '5-0',
    ])
  })

  test('leaves a failed entry pending (no ack) for the reaper to retry', async () => {
    const subscriber = stagedSubscriber([
      ['spotter.event', [entry('6-0', { id: 'e6' })]],
    ])
    const producerClient = new FakeRedis()
    const handler = mock(async () => {
      throw new Error('boom')
    })

    const handle = await new RedisRegulator()
      .message('spotter.event', handler)
      .run(buildContext(subscriber, producerClient), {
        group: 'g',
        consumer: 'c',
        reaperIntervalMs: 999999,
      })
    handles.push(handle)

    await Bun.sleep(20)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(producerClient.callsOf('XACK')).toHaveLength(0)
  })

  test('acks entries that have no registered handler', async () => {
    const subscriber = stagedSubscriber([
      ['orphan.stream', [entry('7-0', { id: 'e7' })]],
    ])
    const producerClient = new FakeRedis()

    const handle = await new RedisRegulator()
      .message('spotter.event', handlerMock())
      .run(buildContext(subscriber, producerClient), {
        group: 'g',
        consumer: 'c',
        reaperIntervalMs: 999999,
      })
    handles.push(handle)

    await Bun.sleep(20)

    expect(producerClient.callsOf('XACK')).toContainEqual([
      'orphan.stream',
      'g',
      '7-0',
    ])
  })
})

describe('RedisRegulator reclaim', () => {
  test('diverts a poison entry to the dead-letter stream and acks it', async () => {
    const subscriber = stagedSubscriber([])
    const handler = handlerMock()

    const producerClient = new FakeRedis()
      // One poisoned (deliveries 5 > max 2) + one healthy entry pending.
      .on('XPENDING', () => [
        ['10-0', 'c', 999999, 5],
        ['11-0', 'c', 999999, 1],
      ])
      .on('XRANGE', () => [entry('10-0', { id: 'poison' })])
      .on('XCLAIM', () => [entry('11-0', { id: 'healthy' })])

    const handle = await new RedisRegulator()
      .message('spotter.event', handler)
      .run(buildContext(subscriber, producerClient), {
        group: 'g',
        consumer: 'c',
        maxDeliveries: 2,
        reaperIntervalMs: 999999,
      })
    handles.push(handle)

    const dead = producerClient.callsOf('XADD')[0]
    expect(dead[0]).toBe('spotter.event.dead')
    expect(dead).toContain('{"id":"poison"}')
    expect(dead).toContain('max-deliveries-exceeded')
    expect(dead).toContain('5')

    // Poison is acked but never dispatched; the healthy entry is claimed,
    // dispatched and acked.
    expect(producerClient.callsOf('XACK')).toContainEqual([
      'spotter.event',
      'g',
      '10-0',
    ])
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].message.value).toBe('{"id":"healthy"}')
    expect(producerClient.callsOf('XACK')).toContainEqual([
      'spotter.event',
      'g',
      '11-0',
    ])
  })

  test('ignores BUSYGROUP when the consumer group already exists', async () => {
    const subscriber = stagedSubscriber([])
    const producerClient = new FakeRedis().on('XGROUP', () => {
      throw new Error('BUSYGROUP Consumer Group name already exists')
    })

    const handle = await new RedisRegulator()
      .message('spotter.event', handlerMock())
      .run(buildContext(subscriber, producerClient), {
        group: 'g',
        consumer: 'c',
        reaperIntervalMs: 999999,
      })
    handles.push(handle)

    expect(producerClient.callsOf('XGROUP')).toHaveLength(1)
  })
})
