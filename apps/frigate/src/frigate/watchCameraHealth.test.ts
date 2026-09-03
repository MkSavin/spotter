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
const serve = (bodies: unknown[]) => {
  let index = 0
  globalThis.fetch = (async () => {
    const body = bodies[Math.min(index, bodies.length - 1)]
    index += 1
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

  test('падение камеры логируется как error', async () => {
    const lines: Line[] = []
    serve([dead])
    const watch = watchCameraHealth(config, makeLogger(lines), 10_000)
    await Bun.sleep(20)
    watch.stop()

    expect(lines[0].level).toBe('error')
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

    expect(lines.filter((line) => line.level === 'error')).toHaveLength(1)
  })

  test('восстановление тоже отмечается', async () => {
    const lines: Line[] = []
    serve([dead, healthy])
    const watch = watchCameraHealth(config, makeLogger(lines), 5)
    await Bun.sleep(40)
    watch.stop()

    expect(lines.some((line) => line.level === 'error')).toBe(true)
    expect(lines.some((line) => line.level === 'info')).toBe(true)
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
