import { expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { TransportContext } from '../../context'
import { createDatabase } from '../../db/client'
import { timelapseWaitsRepo } from '../../db/repository'
import {
  timelapseFailedController,
  timelapseReadyController,
} from './timelapseController'

const deliver = (value: unknown) =>
  ({
    topic: 'spotter.timelapse.ready',
    message: { id: '1-0', value: JSON.stringify(value) },
  }) as never

test('foreign correlated timelapses leave Telegram waits untouched', async () => {
  const db = createDatabase(':memory:')
  try {
    timelapseWaitsRepo.begin(db, {
      camera: 'front',
      tgChatId: '100',
      start: 1_700_000_000,
      end: 1_700_003_600,
    })
    const context = {
      db,
      logger: defaultLogger,
      s3: { presign: () => 'https://example.test/video.mp4' },
      config: { presignExpiry: 60 },
    } as unknown as TransportContext
    const correlation = { requestId: 'appercot:request' }

    await timelapseReadyController(
      deliver({
        source: 'frigate',
        camera: 'front',
        start: 1_700_000_000,
        end: 1_700_003_600,
        speed: 'timelapse',
        videoKey: 'timelapse.mp4',
        ...correlation,
      }),
      context,
    )
    await timelapseFailedController(
      deliver({
        source: 'frigate',
        camera: 'front',
        reason: 'empty',
        ...correlation,
      }),
      context,
    )

    expect(timelapseWaitsRepo.list(db, '100')).toHaveLength(1)
  } finally {
    db.$client.close()
  }
})
