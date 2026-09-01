import { afterEach, describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { CoreConfig } from '../config'
import { FrigateCatalog } from './FrigateCatalog'

defaultLogger.disable()

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const config = {
  frigate: {
    remoteUrl: 'https://nvr.local',
    authSecret: 'secret',
    authUser: 'spotter',
  },
  labels: {
    cameras: { front: '🎥 передняя', side: '🎥 боковая' },
    objects: { person: '🧍 человек' },
  },
} as unknown as CoreConfig

const respondWith = (body: unknown) => {
  globalThis.fetch = (async () => Response.json(body)) as never
}

describe('FrigateCatalog', () => {
  test('lists the cameras Frigate reports', async () => {
    respondWith({ cameras: { front: {}, side: {} } })

    const cameras = await new FrigateCatalog(
      config,
      defaultLogger,
    ).listCameras()

    expect(cameras.map((entry) => entry.code)).toEqual(['front', 'side'])
  })

  test('omits a disabled camera', async () => {
    // Frigate keeps a disabled camera in the config rather than removing it,
    // so offering it would mean requests against a camera that cannot answer.
    respondWith({ cameras: { front: {}, side: { enabled: false } } })

    const cameras = await new FrigateCatalog(
      config,
      defaultLogger,
    ).listCameras()

    expect(cameras.map((entry) => entry.code)).toEqual(['front'])
  })

  test('treats a camera without the flag as enabled', async () => {
    // `enabled` defaults to true in Frigate's own schema.
    respondWith({ cameras: { front: {}, side: { enabled: true } } })

    const cameras = await new FrigateCatalog(
      config,
      defaultLogger,
    ).listCameras()

    expect(cameras.map((entry) => entry.code)).toEqual(['front', 'side'])
  })

  test('keeps object types from a disabled camera', async () => {
    // The taxonomy also renders events a since-disabled camera already left.
    respondWith({
      cameras: {
        front: { objects: { track: ['person'] } },
        side: { enabled: false, objects: { track: ['car'] } },
      },
    })

    const objects = await new FrigateCatalog(
      config,
      defaultLogger,
    ).listObjectTypes()

    expect(objects.map((entry) => entry.code).sort()).toEqual(['car', 'person'])
  })

  test('falls back to configured labels when Frigate is unreachable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('no route to host')
    }) as never

    const cameras = await new FrigateCatalog(
      config,
      defaultLogger,
    ).listCameras()

    // Better a stale list than "неизв. камера" everywhere.
    expect(cameras.map((entry) => entry.code)).toEqual(['front', 'side'])
  })

  test('does not cache a failure', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      if (calls === 1) return new Response('nope', { status: 500 })
      return Response.json({ cameras: { front: {} } })
    }) as never

    const catalog = new FrigateCatalog(config, defaultLogger)

    await catalog.listCameras()
    // A briefly-down Frigate must not leave the catalog wrong until restart.
    expect((await catalog.listCameras()).map((e) => e.code)).toEqual(['front'])
  })
})
