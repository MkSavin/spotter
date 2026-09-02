import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { CommandBus, RedisConnection } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import { deviceRedeemHandler, userSignHandler } from '../../apps/server/src/commands/handlers'
import * as serverSchema from '../../apps/server/src/db/schema'
import { authHandler } from '../../apps/pwa/src/server/handlers/auth'
import * as pwaSchema from '../../apps/pwa/src/db/schema'

const URL_ = 'redis://127.0.0.1:6399'
defaultLogger.disable?.()

const mem = (schema: object, folder: string) => {
  const db = drizzle(new Database(':memory:'), { schema })
  migrate(db, { migrationsFolder: folder })
  return db
}

let serverDb: ReturnType<typeof mem>
let pwaDb: ReturnType<typeof mem>
let bus: CommandBus
let conns: RedisConnection[] = []

// Minimal server side: consume spotter.command.request, reply on .reply.
const startServer = async () => {
  const pub = new RedisConnection(URL_, defaultLogger)
  const sub = new RedisConnection(URL_, defaultLogger)
  conns.push(pub, sub)
  await pub.connect(); await sub.connect()

  const loop = async () => {
    let offset = '$'
    for (;;) {
      const res = (await sub.send('XREAD', ['COUNT','10','BLOCK','500','STREAMS','spotter.command.request',offset])) as Record<string,[string,string[]][]> | null
      if (!res) continue
      for (const entries of Object.values(res)) {
        for (const [id, fields] of entries) {
          offset = id
          const obj: Record<string,string> = {}
          for (let i=0;i<fields.length;i+=2) obj[fields[i]] = fields[i+1]
          const req = JSON.parse(obj.value)
          const ctx = { db: serverDb, config: { auth: { codeTtlMs: 86400_000 } }, logger: { sub: () => ({info(){},warn(){},error(){}}) } } as never
          const handler = req.kind === 'device.redeem' ? deviceRedeemHandler : userSignHandler
          const out = await handler(req.args, ctx)
          const reply = { requestId: req.requestId, instanceId: req.instanceId, ...out }
          await pub.send('XADD', ['spotter.command.reply','*','value',JSON.stringify(reply)])
        }
      }
    }
  }
  void loop()
}

beforeAll(async () => {
  serverDb = mem(serverSchema, 'apps/server/drizzle')
  pwaDb = mem(pwaSchema, 'apps/pwa/drizzle')
  await startServer()

  const pub = new RedisConnection(URL_, defaultLogger)
  const sub = new RedisConnection(URL_, defaultLogger)
  conns.push(pub, sub)
  await pub.connect(); await sub.connect()
  const producer = { publish: (s: string, p: unknown) => pub.send('XADD',[s,'*','value',JSON.stringify(p)]) }
  bus = new CommandBus(producer as never, sub, defaultLogger, { pollBlockMs: 200, timeoutMs: 8000 })
  bus.start()
})

afterAll(async () => { bus?.stop(); for (const c of conns) await c.close?.() })

describe('вход в PWA целиком: код -> /api/auth -> device.redeem', () => {
  test('свежий код авторизует устройство', async () => {
    const signed = await bus.send('user.sign', {})
    const { code } = signed.data as { code: string }
    console.log('  выдан код:', code)

    const ctx = { db: pwaDb, commandBus: bus, logger: { warn(){}, sub: () => ({info(){},warn(){}}) } } as never
    const req = new Request('http://localhost:3000/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: crypto.randomUUID(), code }),
    })
    const res = await authHandler(req, ctx)
    const body = await res.json()
    console.log('  /api/auth ->', res.status, JSON.stringify(body))
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  }, 20000)
})
