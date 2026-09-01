import { describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { SinkContext } from '../runtime/context'
import { createSuspendController } from './createSuspendController'
import { NotificationSuspender } from './NotificationSuspender'

class RecordingSuspender extends NotificationSuspender {
  readonly calls: { camera: string; minutes: number }[] = []

  async suspend(camera: string, minutes: number): Promise<void> {
    this.calls.push({ camera, minutes })
  }
}

const makeContext = () =>
  ({
    sourceId: 'frigate-home',
    logger: defaultLogger,
  }) as any as SinkContext<any>

const deliver = (payload: unknown) => ({
  topic: 'spotter.notifications.suspend.frigate-home',
  message: { value: Buffer.from(JSON.stringify(payload)) },
})

describe('createSuspendController', () => {
  test('passes a valid request to the NVR', async () => {
    const suspender = new RecordingSuspender()
    const controller = createSuspendController(suspender)

    await controller(
      deliver({ source: 'frigate-home', camera: 'yard', minutes: 30 }) as any,
      makeContext(),
    )

    expect(suspender.calls).toEqual([{ camera: 'yard', minutes: 30 }])
  })

  test('zero minutes lifts the suspension', async () => {
    const suspender = new RecordingSuspender()
    const controller = createSuspendController(suspender)

    await controller(
      deliver({ source: 'frigate-home', camera: 'yard', minutes: 0 }) as any,
      makeContext(),
    )

    expect(suspender.calls[0].minutes).toBe(0)
  })

  test('ignores requests aimed at another source', async () => {
    const suspender = new RecordingSuspender()
    const controller = createSuspendController(suspender)

    await controller(
      deliver({ source: 'other-nvr', camera: 'yard', minutes: 30 }) as any,
      makeContext(),
    )

    expect(suspender.calls).toHaveLength(0)
  })

  test('skips malformed payloads instead of throwing', async () => {
    const suspender = new RecordingSuspender()
    const controller = createSuspendController(suspender)

    await controller(
      deliver({ source: 'frigate-home', minutes: 'soon' }) as any,
      makeContext(),
    )

    expect(suspender.calls).toHaveLength(0)
  })

  test('a failing NVR call propagates, so the entry is retried', async () => {
    class FailingSuspender extends NotificationSuspender {
      async suspend(): Promise<void> {
        throw new Error('broker unreachable')
      }
    }
    const controller = createSuspendController(new FailingSuspender())

    expect(
      controller(
        deliver({ source: 'frigate-home', camera: 'yard', minutes: 5 }) as any,
        makeContext(),
      ),
    ).rejects.toThrow('broker unreachable')
  })
})
