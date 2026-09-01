import { beforeEach, describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { TransportContext } from '../../context'
import { createDatabase, type PwaDatabase } from '../../db/client'
import { timelapsesRepo } from '../../db/repository'
import {
  timelapseFailedController,
  timelapseReadyController,
} from './timelapseController'

defaultLogger.disable()

const span = { camera: 'front', start: 1_700_000_000, end: 1_700_003_600 }

const deliver = (value: unknown) =>
  ({
    topic: 'spotter.timelapse.ready',
    message: { id: '1-0', value: JSON.stringify(value) },
  }) as never

describe('timelapse controllers', () => {
  let db: PwaDatabase
  let context: TransportContext

  beforeEach(() => {
    db = createDatabase(':memory:')
    context = { db, logger: defaultLogger } as unknown as TransportContext
  })

  const startOne = () =>
    timelapsesRepo.start(db, {
      ...span,
      speed: 'timelapse',
      requestedBy: 'r-1',
    })

  test('a ready export settles the row it belongs to', async () => {
    startOne()

    await timelapseReadyController(
      deliver({
        source: 'frigate',
        ...span,
        speed: 'timelapse',
        videoKey: 'staging/tl.mp4',
      }),
      context,
    )

    const [row] = timelapsesRepo.list(db)
    expect(row.state).toBe('ready')
    expect(row.videoKey).toBe('staging/tl.mp4')
  })

  test('a redelivery does not create a second row', async () => {
    startOne()
    const ready = {
      source: 'frigate',
      ...span,
      speed: 'timelapse',
      videoKey: 'staging/tl.mp4',
    }

    await timelapseReadyController(deliver(ready), context)
    await timelapseReadyController(deliver(ready), context)

    expect(timelapsesRepo.list(db)).toHaveLength(1)
  })

  test('an export that outlived the request is still recorded', async () => {
    // Restart between request and completion: nothing is waiting, but the
    // video exists and should not be thrown away.
    await timelapseReadyController(
      deliver({
        source: 'frigate',
        ...span,
        speed: 'timelapse',
        videoKey: 'staging/tl.mp4',
      }),
      context,
    )

    expect(timelapsesRepo.list(db)[0]?.state).toBe('ready')
  })

  test('a failure marks the running export with its reason', async () => {
    startOne()

    await timelapseFailedController(
      deliver({ source: 'frigate', camera: 'front', reason: 'empty' }),
      context,
    )

    const [row] = timelapsesRepo.list(db)
    expect(row.state).toBe('failed')
    expect(row.reason).toBe('empty')
  })

  test('a failure leaves a finished export alone', async () => {
    startOne()
    await timelapseReadyController(
      deliver({
        source: 'frigate',
        ...span,
        speed: 'timelapse',
        videoKey: 'staging/tl.mp4',
      }),
      context,
    )

    await timelapseFailedController(
      deliver({ source: 'frigate', camera: 'front', reason: 'rejected' }),
      context,
    )

    // Already delivered: a later failure for the camera must not erase it.
    expect(timelapsesRepo.list(db)[0]?.state).toBe('ready')
  })

  test('garbage off the wire is ignored', async () => {
    await timelapseReadyController(deliver({ nope: true }), context)
    expect(timelapsesRepo.list(db)).toHaveLength(0)
  })

  test('retrying a failed span clears the old failure', async () => {
    startOne()
    await timelapseFailedController(
      deliver({ source: 'frigate', camera: 'front', reason: 'empty' }),
      context,
    )

    startOne()

    const [row] = timelapsesRepo.list(db)
    expect(row.state).toBe('running')
    expect(row.reason).toBeNull()
  })
})
