import { afterEach, describe, expect, test } from 'bun:test'
import type { CoreConfig } from '../config'
import { watchCameraHealth } from './watchCameraHealth'

const config = {
  frigate: { remoteUrl: 'http://nvr.local/', authUser: '', authSecret: '' },
} as unknown as CoreConfig

const savedFetch = globalThis.fetch

type Line = { level: string; message: string }

const makeLogger = (lines: Line[]) =>
  ({
    info: (message: string) => lines.push({ level: 'info', message }),
    debug: (message: string) => lines.push({ level: 'debug', message }),
    warn: (message: string) => lines.push({ level: 'warn', message }),
    error: (message: string) => lines.push({ level: 'error', message }),
    sub() {
      return this
    },
  }) as never

/** Serves a queue of /api/stats bodies, repeating the last one. */
const serve = (bodies: unknown[], cameraConfig: unknown = { cameras: {} }) => {
  let index = 0
  globalThis.fetch = (async (input: Request | string) => {
    const url = String(typeof input === 'string' ? input : input.url)
    // Health reads /api/config too; only /api/stats advances the queue.
    const body = url.includes('/api/config')
      ? cameraConfig
      : bodies[Math.min(index++, bodies.length - 1)]
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

const healthy = { cameras: { front: { camera_fps: 5, detection_fps: 2 } } }
const dead = { cameras: { front: { camera_fps: 0, detection_fps: 0 } } }

afterEach(() => {
  globalThis.fetch = savedFetch
})

describe('watchCameraHealth', () => {
  test('сообщает текущее состояние после первого опроса', async () => {
    serve([dead])
    const watch = watchCameraHealth(config, makeLogger([]), 10_000)
    await Bun.sleep(20)
    watch.stop()

    expect(watch.current()).toEqual({ dead: ['front'], stalled: [] })
  })

  test('падение камеры логируется как warn, а не error', async () => {
    const lines: Line[] = []
    serve([dead])
    const watch = watchCameraHealth(config, makeLogger(lines), 10_000)
    await Bun.sleep(20)
    watch.stop()

    // The adapter is working; the NVR is not. `error` is for our own failures.
    expect(lines[0].level).toBe('warn')
    expect(lines[0].message).toContain('front')
  })

  test('неизменное состояние не повторяется в логе', async () => {
    const lines: Line[] = []
    serve([dead])
    const watch = watchCameraHealth(config, makeLogger(lines), 5)
    // Several polls of an unchanged fault: at one a minute in production,
    // repeating it would bury everything else.
    await Bun.sleep(40)
    watch.stop()

    expect(lines.filter((line) => line.level === 'warn')).toHaveLength(1)
  })

  test('восстановление тоже отмечается', async () => {
    const lines: Line[] = []
    serve([dead, healthy])
    const watch = watchCameraHealth(config, makeLogger(lines), 5)
    await Bun.sleep(40)
    watch.stop()

    expect(lines.some((line) => line.level === 'warn')).toBe(true)
    expect(lines.some((line) => line.level === 'info')).toBe(true)
  })

  test('мигание одной камеры не перепечатывает вторую', async () => {
    const lines: Line[] = []
    // `detection_fps` legitimately touches zero on an idle camera, so `front`
    // flaps between stalled and fine while `side` stays dead throughout.
    const stalledSide = {
      cameras: {
        side: { camera_fps: 0, detection_fps: 0 },
        front: { camera_fps: 5, detection_fps: 0 },
      },
    }
    const idleSide = {
      cameras: {
        side: { camera_fps: 0, detection_fps: 0 },
        front: { camera_fps: 5, detection_fps: 0.1 },
      },
    }
    serve([stalledSide, idleSide, stalledSide, idleSide, stalledSide])
    const watch = watchCameraHealth(config, makeLogger(lines), 5)
    await Bun.sleep(60)
    watch.stop()

    const deadLines = lines.filter((line) => line.message.includes('no video'))
    expect(deadLines).toHaveLength(1)
  })

  test('выключенная в конфиге камера не считается отказом', async () => {
    const lines: Line[] = []
    // Frigate keeps switched-off cameras in /api/stats with zero fps, and
    // `detection_enabled` is `detect.enabled`, which stays true for them.
    serve([{ cameras: { side: { camera_fps: 0, detection_fps: 0 } } }], {
      cameras: { side: { enabled: false } },
    })
    const watch = watchCameraHealth(config, makeLogger(lines), 10_000)
    await Bun.sleep(20)
    watch.stop()

    expect(watch.current()).toEqual({ dead: [], stalled: [] })
    expect(lines.some((line) => line.level === 'warn')).toBe(false)
  })

  test('неудачный опрос не стирает последнее известное состояние', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify(dead), { status: 200 })
      }
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    const watch = watchCameraHealth(config, makeLogger([]), 5)
    await Bun.sleep(40)
    watch.stop()

    // A failed probe is not evidence of health; clearing the warning would be
    // worse than keeping a slightly stale one.
    expect(watch.current()).toEqual({ dead: ['front'], stalled: [] })
  })

  test('до первого ответа состояние неизвестно, а не «всё хорошо»', () => {
    serve([healthy])
    const watch = watchCameraHealth(config, makeLogger([]), 10_000)
    watch.stop()

    expect(watch.current()).toBeUndefined()
  })
})
