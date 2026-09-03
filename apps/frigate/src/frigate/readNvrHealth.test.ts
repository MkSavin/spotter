import { afterEach, describe, expect, test } from 'bun:test'
import type { CoreConfig } from '../config'
import {
  type CameraHealth,
  deadCameras,
  readNvrHealth,
  stalledCameras,
} from './readNvrHealth'

const config = {
  frigate: { remoteUrl: 'http://nvr.local/', authUser: '', authSecret: '' },
} as unknown as CoreConfig

const savedFetch = globalThis.fetch

const respond = (body: unknown, status = 200) => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = savedFetch
})

const camera = (over: Partial<CameraHealth> = {}): CameraHealth => ({
  camera: 'front',
  cameraFps: 5,
  detectionFps: 5,
  detectionEnabled: true,
  ...over,
})

describe('deadCameras', () => {
  test('камера без кадров — это отказ', () => {
    // Exactly the 1 September failure: ffmpeg could not open the stream.
    const found = deadCameras([camera({ cameraFps: 0, detectionFps: 0 })])
    expect(found.map((c) => c.camera)).toEqual(['front'])
  })

  test('здоровая камера не считается отказом', () => {
    expect(deadCameras([camera()])).toEqual([])
  })

  test('выключенная детекция — это выбор, а не поломка', () => {
    // `side` in production: disabled on purpose, and warning about it would
    // train the reader to ignore the warning.
    const off = camera({
      camera: 'side',
      cameraFps: 0,
      detectionEnabled: false,
    })
    expect(deadCameras([off])).toEqual([])
  })
})

describe('stalledCameras', () => {
  test('видео есть, детекции нет — событий не будет', () => {
    const found = stalledCameras([camera({ cameraFps: 5, detectionFps: 0 })])
    expect(found.map((c) => c.camera)).toEqual(['front'])
  })

  test('мёртвая камера не считается ещё и застрявшей', () => {
    // Otherwise one fault is reported twice under two different names.
    expect(stalledCameras([camera({ cameraFps: 0, detectionFps: 0 })])).toEqual(
      [],
    )
  })

  test('здоровая камера не застряла', () => {
    expect(stalledCameras([camera()])).toEqual([])
  })
})

describe('readNvrHealth', () => {
  test('разбирает ответ /api/stats', async () => {
    respond({
      cameras: {
        front: {
          camera_fps: 5.02,
          detection_fps: 1.2,
          detection_enabled: true,
        },
        side: { camera_fps: 0, detection_fps: 0, detection_enabled: false },
      },
    })

    const health = await readNvrHealth(config)
    expect(health.state).toBe('ok')
    if (health.state !== 'ok') return

    expect(health.cameras).toEqual([
      {
        camera: 'front',
        cameraFps: 5.02,
        detectionFps: 1.2,
        detectionEnabled: true,
      },
      {
        camera: 'side',
        cameraFps: 0,
        detectionFps: 0,
        detectionEnabled: false,
      },
    ])
  })

  test('старый NVR без detection_enabled считается включённым', async () => {
    // Assuming "off" would silently excuse a dead camera.
    respond({ cameras: { front: { camera_fps: 0, detection_fps: 0 } } })

    const health = await readNvrHealth(config)
    if (health.state !== 'ok') throw new Error('expected ok')

    expect(health.cameras[0].detectionEnabled).toBe(true)
    expect(deadCameras(health.cameras)).toHaveLength(1)
  })

  test('нерабочий API — unknown, а не "всё хорошо"', async () => {
    respond({}, 500)
    expect((await readNvrHealth(config)).state).toBe('unknown')
  })

  test('сетевой сбой не роняет адаптер', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    expect((await readNvrHealth(config)).state).toBe('unknown')
  })
})
