import { afterAll, describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { CoreContext } from '../context'
import { createDatabase } from '../db/client'
import { createServer } from './createServer'

defaultLogger.disable()

/** Stands in for the server: accepts one code, refuses everything else. */
const sentCommands: Array<{ kind: string; args: Record<string, unknown> }> = []

const commandBus = {
  send: async (kind: string, args: Record<string, unknown>) => {
    sentCommands.push({ kind, args })

    if (kind === 'device.redeem') {
      return args.code === 'LETMEIN'
        ? {
            requestId: '1',
            ok: true,
            data: { recipientUuid: 'r-1', role: 'ADMIN' },
          }
        : { requestId: '1', ok: false, error: 'not-found' }
    }

    if (kind === 'user.list') {
      return { requestId: '1', ok: true, data: { users: [] } }
    }

    return { requestId: '1', ok: true, data: {} }
  },
}

const published: Array<{ stream: string; payload: unknown }> = []

const makeContext = (): CoreContext =>
  ({
    config: {
      port: 0,
      vapid: { publicKey: 'PUBKEY', privateKey: 'x', subject: 'mailto:a@b.c' },
      presignExpiry: 3600,
      source: 'frigate',
      timezone: 'Europe/Moscow',
    },
    logger: defaultLogger.sub('test'),
    db: createDatabase(':memory:'),
    s3: { presign: (key: string) => `https://s3/${key}` },
    push: { send: async () => ({ ok: true }) },
    commandBus,
    catalog: { cameras: () => [{ code: 'front', label: '🎥 front' }] },
    heartbeats: { all: () => [] },
    producer: {
      publish: async (stream: string, payload: unknown) => {
        published.push({ stream, payload })
        return '1-0'
      },
    },
  }) as unknown as CoreContext

describe('createServer', () => {
  const server = createServer(makeContext())
  const base = server.url.href.replace(/\/$/, '')

  /** Redeems the shared code and returns the bearer it hands back. */
  const authorizeDevice = async (deviceId = 'device-1'): Promise<string> => {
    const response = await fetch(`${base}/api/auth`, {
      method: 'POST',
      body: JSON.stringify({ deviceId, code: 'LETMEIN' }),
    })
    return ((await response.json()) as { token: string }).token
  }

  afterAll(() => server.stop(true))

  test('GET /api/health', async () => {
    const res = await fetch(`${base}/api/health`)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('GET /api/vapid exposes the public key', async () => {
    const res = await fetch(`${base}/api/vapid`)
    expect(await res.json()).toEqual({ publicKey: 'PUBKEY' })
  })

  test('a rejected code yields no token', async () => {
    const res = await fetch(`${base}/api/auth`, {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'device-x', code: 'nope' }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).not.toHaveProperty('token')
  })

  test('a redeemed code returns a bearer and the domain role', async () => {
    const res = await fetch(`${base}/api/auth`, {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'device-2', code: 'LETMEIN' }),
    })

    const body = (await res.json()) as { role: string; token: string }
    expect(body.role).toBe('ADMIN')
    expect(typeof body.token).toBe('string')
  })

  test('the feed requires a token', async () => {
    // It carries snapshots of the house; an open endpoint would serve them to
    // anyone who knows the URL.
    expect((await fetch(`${base}/api/events`)).status).toBe(401)
  })

  test('the feed answers an authorized device', async () => {
    const token = await authorizeDevice('device-feed')

    const res = await fetch(`${base}/api/events`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(await res.json()).toEqual({ events: [] })
  })

  test('a forged token is refused', async () => {
    const res = await fetch(`${base}/api/events`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    })
    expect(res.status).toBe(401)
  })

  test('a snapshot request reaches the adapter', async () => {
    const token = await authorizeDevice('device-snap')
    published.length = 0

    const res = await fetch(`${base}/api/snapshot`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ camera: 'front' }),
    })

    expect(res.status).toBe(200)
    expect(published[0]?.stream).toBe('spotter.camera.request.frigate')
    expect(published[0]?.payload).toMatchObject({ camera: 'front' })
  })

  test('a snapshot of an unknown camera is refused before publishing', async () => {
    const token = await authorizeDevice('device-snap2')
    published.length = 0

    const res = await fetch(`${base}/api/snapshot`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ camera: 'garden' }),
    })

    expect(res.status).toBe(404)
    expect(published).toHaveLength(0)
  })

  test('a timelapse request reaches the adapter and is recorded', async () => {
    const token = await authorizeDevice('device-tl')
    published.length = 0

    const res = await fetch(`${base}/api/timelapses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        camera: 'front',
        start: 1_700_000_000,
        end: 1_700_003_600,
        speed: 'timelapse',
      }),
    })

    expect(res.status).toBe(200)
    expect(published[0]?.stream).toBe('spotter.timelapse.request.frigate')

    // Recorded as running, so a restart mid-export does not lose it.
    const list = await fetch(`${base}/api/timelapses`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await list.json()) as {
      timelapses: Array<{ state: string; camera: string }>
    }
    expect(body.timelapses[0]).toMatchObject({
      state: 'running',
      camera: 'front',
    })
  })

  test('a backwards period is refused before publishing', async () => {
    const token = await authorizeDevice('device-tl2')
    published.length = 0

    const res = await fetch(`${base}/api/timelapses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        camera: 'front',
        start: 1_700_003_600,
        end: 1_700_000_000,
        speed: 'timelapse',
      }),
    })

    expect(res.status).toBe(400)
    expect(published).toHaveLength(0)
  })

  test('user management forwards to the domain', async () => {
    const token = await authorizeDevice('device-admin')
    sentCommands.length = 0

    await fetch(`${base}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(sentCommands.at(-1)?.kind).toBe('user.list')

    await fetch(`${base}/api/users/role`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ref: 'someone', role: 'USER' }),
    })
    expect(sentCommands.at(-1)).toMatchObject({
      kind: 'user.setRole',
      args: { ref: 'someone', role: 'USER' },
    })
  })

  test('an admin cannot revoke themselves', async () => {
    // The grant in these tests is recipient r-1; revoking it would lock the
    // last admin out of the domain.
    const token = await authorizeDevice('device-admin2')

    const res = await fetch(`${base}/api/users/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ref: 'r-1' }),
    })

    expect(res.status).toBe(400)
  })

  test('cameras and status need a token too', async () => {
    expect((await fetch(`${base}/api/cameras`)).status).toBe(401)
    expect((await fetch(`${base}/api/status`)).status).toBe(401)

    const token = await authorizeDevice('device-cam')
    const res = await fetch(`${base}/api/cameras`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(((await res.json()) as { cameras: unknown[] }).cameras).toHaveLength(
      1,
    )
  })

  test('invalid body → 400', async () => {
    const res = await fetch(`${base}/api/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ subscription: { endpoint: 'not-a-url' } }),
    })
    expect(res.status).toBe(400)
  })
})
