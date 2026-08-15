import { afterAll, describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { CoreContext } from '../context'
import { createDatabase } from '../db/client'
import { createServer } from './createServer'

// Serves the real web/dist; `bun run test` builds it first.
const makeContext = (): CoreContext =>
  ({
    config: {
      port: 0,
      vapid: { publicKey: 'P', privateKey: 'x', subject: 'mailto:a@b.c' },
      presignExpiry: 3600,
      accessCodes: [],
      source: 'frigate',
      timezone: 'Europe/Moscow',
    },
    logger: defaultLogger.sub('test'),
    db: createDatabase(':memory:'),
    s3: { presign: (k: string) => `https://s3/${k}` },
    push: { send: async () => ({ ok: true }) },
  }) as unknown as CoreContext

describe('static serving', () => {
  const server = createServer(makeContext())
  const base = server.url.href.replace(/\/$/, '')

  afterAll(() => server.stop(true))

  test('serves the SPA shell for a deep link', async () => {
    const res = await fetch(`${base}/event/some-id`)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('<div id="root">')
  })

  test('serves the web manifest asset', async () => {
    const res = await fetch(`${base}/manifest.webmanifest`)
    expect(res.status).toBe(200)
  })
})
