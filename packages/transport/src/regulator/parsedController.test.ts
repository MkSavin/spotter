import { describe, expect, mock, test } from 'bun:test'
import { parsedController } from './parsedController'
import type { StreamMessagePayload } from './RedisRegulator'

type Handled = [{ n: number }, unknown, StreamMessagePayload]

/** Typed so the recorded calls stay inspectable. */
const handler = () => mock(async (..._args: Handled) => undefined)

const payload = (value: unknown) => ({
  topic: 'spotter.test',
  message: {
    id: '1-0',
    value: Buffer.from(
      typeof value === 'string' ? value : JSON.stringify(value),
    ),
  },
})

const parseNumber = (value: unknown): { n: number } | null =>
  typeof (value as { n?: unknown })?.n === 'number'
    ? { n: (value as { n: number }).n }
    : null

describe('parsedController', () => {
  test('hands the parsed value to the handler', async () => {
    const handle = handler()
    const controller = parsedController(parseNumber, handle)

    await controller(payload({ n: 7 }) as never, { ctx: true })

    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle.mock.calls[0][0]).toEqual({ n: 7 })
    expect(handle.mock.calls[0][1]).toEqual({ ctx: true })
  })

  test('the payload reaches the handler, so topic stays available', async () => {
    const handle = handler()

    await parsedController(parseNumber, handle)(payload({ n: 1 }) as never, {})

    expect(handle.mock.calls[0][2].topic).toBe('spotter.test')
  })

  // Adapters publish malformed messages routinely; dropping them here is the
  // whole point of the wrapper.
  test('unparsable JSON never reaches the handler', async () => {
    const handle = handler()

    await parsedController(parseNumber, handle)(
      payload('{not json') as never,
      {},
    )

    expect(handle).not.toHaveBeenCalled()
  })

  test('a payload the schema rejects never reaches the handler', async () => {
    const handle = handler()

    await parsedController(parseNumber, handle)(
      payload({ n: 'seven' }) as never,
      {},
    )

    expect(handle).not.toHaveBeenCalled()
  })

  test('a parser answering undefined is treated as a rejection', async () => {
    const handle = handler()

    await parsedController(() => undefined, handle)(
      payload({ n: 1 }) as never,
      {},
    )

    expect(handle).not.toHaveBeenCalled()
  })

  test('a throwing handler propagates, leaving the entry unacked', async () => {
    const controller = parsedController(parseNumber, async () => {
      throw new Error('boom')
    })

    expect(controller(payload({ n: 1 }) as never, {})).rejects.toThrow('boom')
  })
})
