import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { CoreContext } from '../context'
import { createDatabase } from '../db/client'
import { createServer } from './createServer'

const makeContext = (): CoreContext =>
  ({
    config: {
      port: 0,
      vapid: { publicKey: 'PUBKEY', privateKey: 'x', subject: 'mailto:a@b.c' },
      presignExpiry: 3600,
      accessCodes: ['LETMEIN'],
      source: 'frigate',
      timezone: 'Europe/Moscow',
    },
    logger: defaultLogger.sub('test'),
    db: createDatabase(':memory:'),
    s3: { presign: (key: string) => `https://s3/${key}` },
    push: { send: async () => ({ ok: true }) },
  }) as unknown as CoreContext

describe('createServer', () => {
  const server = createServer(makeContext())
  const base = server.url.href.replace(/\/$/, '')

  afterAll(() => server.stop(true))

  test('GET /api/health', async () => {
    const res = await fetch(`${base}/api/health`)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('GET /api/vapid exposes the public key', async () => {
    const res = await fetch(`${base}/api/vapid`)
    expect(await res.json()).toEqual({ publicKey: 'PUBKEY' })
  })

  test('subscribe → auth → unauthorized code flow', async () => {
    const subscription = {
      endpoint: 'https://push.example/abc',
      p256dh: 'p',
      auth: 'a',
    }

    const sub = await fetch(`${base}/api/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ subscription, deviceLabel: 'phone' }),
    })
    expect(await sub.json()).toMatchObject({
      endpoint: subscription.endpoint,
      authorized: false,
    })

    const bad = await fetch(`${base}/api/auth`, {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint, code: 'nope' }),
    })
    expect(bad.status).toBe(401)

    const good = await fetch(`${base}/api/auth`, {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        code: 'LETMEIN',
      }),
    })
    expect(await good.json()).toMatchObject({ authorized: true })
  })

  test('GET /api/events returns an (empty) list', async () => {
    const res = await fetch(`${base}/api/events`)
    expect(await res.json()).toEqual({ events: [] })
  })

  test('invalid body → 400', async () => {
    const res = await fetch(`${base}/api/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ subscription: { endpoint: 'not-a-url' } }),
    })
    expect(res.status).toBe(400)
  })
})
