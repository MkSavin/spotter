import { describe, expect, mock, test } from 'bun:test'
import type { StreamProducer } from '@spotter/transport'
import { forward } from './forward'

const fakeProducer = () => {
  const send = mock(async (_command: string, _args: string[]) => 'ok')
  return { producer: { send } as unknown as StreamProducer, send }
}

describe('forward', () => {
  test('mirrors the raw value to the same-named stream with a capped XADD', async () => {
    const { producer, send } = fakeProducer()
    const handler = forward(producer, 500)

    await handler(
      { topic: 'spotter.event', message: { id: '5-0', value: '{"id":"e5"}' } },
      {},
    )

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]).toEqual([
      'XADD',
      ['spotter.event', 'MAXLEN', '~', '500', '*', 'value', '{"id":"e5"}'],
    ])
  })

  test('forwards the value verbatim without re-encoding', async () => {
    const { producer, send } = fakeProducer()
    const handler = forward(producer, 10000)
    const raw = '{"id":"e6","nested":{"a":1},"emoji":"🚗"}'

    await handler(
      {
        topic: 'spotter.media.request.frigate',
        message: { id: '6-0', value: raw },
      },
      {},
    )

    const [, args] = send.mock.calls[0] as [string, string[]]
    expect(args[0]).toBe('spotter.media.request.frigate')
    expect(args.at(-1)).toBe(raw)
  })
})
