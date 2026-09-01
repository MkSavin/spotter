import { afterEach, describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import {
  type CommandReply,
  type CommandRequest,
  deliveryStreams,
} from '../schema/delivery'
import { CommandBus } from './CommandBus'

type Entry = [string, string[]]

/**
 * Minimal stand-in for the reply stream: each XREAD hands back one queued
 * batch, so a test can script exactly what the poll loop observes.
 */
class FakeSubscriber {
  private readonly batches: Entry[][] = []
  published: CommandRequest[] = []

  queue(id: string, value: unknown): void {
    this.batches.push([[id, ['value', JSON.stringify(value)]]])
  }

  /** Queues a batch that is not valid JSON / not a reply. */
  queueRaw(id: string, fields: string[]): void {
    this.batches.push([[id, fields]])
  }

  async send(_command: string, _args: string[]): Promise<unknown> {
    const batch = this.batches.shift()
    if (!batch) {
      // Nothing scripted: behave like a BLOCK that expired.
      await Bun.sleep(1)
      return null
    }
    return { [deliveryStreams.commandReply]: batch }
  }
}

const makeBus = (subscriber: FakeSubscriber, timeoutMs = 250) => {
  const producer = {
    publish: async (_stream: string, payload: unknown): Promise<string> => {
      subscriber.published.push(payload as CommandRequest)
      return '1-0'
    },
  }

  return new CommandBus(producer as never, subscriber as never, defaultLogger, {
    timeoutMs,
    pollBlockMs: 1,
  })
}

const buses: CommandBus[] = []
afterEach(() => {
  for (const bus of buses.splice(0)) bus.stop()
})

describe('CommandBus', () => {
  test('resolves the caller whose requestId the reply carries', async () => {
    const subscriber = new FakeSubscriber()
    const bus = makeBus(subscriber)
    buses.push(bus)
    bus.start()

    const pending = bus.send('event.info', { code: 'abc' }, 'uuid-1')

    // The requestId is generated inside send(), so the reply has to be built
    // from what was actually published.
    await Bun.sleep(5)
    const request = subscriber.published[0]
    const reply: CommandReply = {
      requestId: request.requestId,
      ok: true,
      data: { seen: true },
    }
    subscriber.queue('1-0', reply)

    expect(await pending).toEqual(reply)
    expect(request.kind).toBe('event.info')
    expect(request.principalUuid).toBe('uuid-1')
  })

  test('rejects once the reply misses the deadline', async () => {
    const subscriber = new FakeSubscriber()
    const bus = makeBus(subscriber, 60)
    buses.push(bus)
    bus.start()

    // Nothing is ever queued, so the request simply goes unanswered.
    await expect(bus.send('user.setRole')).rejects.toThrow(
      /timed out after 60ms/,
    )
  })

  test('ignores a reply addressed to another instance', async () => {
    const subscriber = new FakeSubscriber()
    const bus = makeBus(subscriber, 80)
    buses.push(bus)
    bus.start()

    const pending = bus.send('event.clip')

    // A concurrent telegram replica's reply must not settle our promise.
    subscriber.queue('1-0', {
      requestId: 'someone-elses-request',
      ok: true,
    } satisfies CommandReply)

    await expect(pending).rejects.toThrow(/timed out/)
  })

  test('survives malformed entries and still delivers the next reply', async () => {
    const subscriber = new FakeSubscriber()
    const bus = makeBus(subscriber)
    buses.push(bus)
    bus.start()

    const pending = bus.send('login.redeem')
    await Bun.sleep(5)
    const { requestId } = subscriber.published[0]

    // Junk on the stream must not kill the poll loop.
    subscriber.queueRaw('1-0', ['value', 'not json at all'])
    subscriber.queueRaw('1-1', ['nothing', 'useful'])
    subscriber.queue('1-2', { requestId, nonsense: true })
    subscriber.queue('1-3', { requestId, ok: false, error: 'forbidden' })

    expect(await pending).toEqual({ requestId, ok: false, error: 'forbidden' })
  })

  test('start is idempotent', () => {
    const subscriber = new FakeSubscriber()
    const bus = makeBus(subscriber)
    buses.push(bus)

    bus.start()
    bus.start()

    expect(() => bus.stop()).not.toThrow()
  })
})
