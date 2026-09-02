import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { deviceRedeemHandler, userSignHandler } from '../../apps/server/src/commands/handlers'
import * as schema from '../../apps/server/src/db/schema'

const makeDb = () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: 'apps/server/drizzle' })
  return db
}

const ctx = (db: unknown, ttlHours = 24) =>
  ({
    db,
    config: { auth: { codeTtlMs: ttlHours * 3600_000 } },
    logger: { sub: () => ({ info() {}, warn() {}, error() {} }) },
  }) as never

describe('device.redeem — реальный путь входа в PWA', () => {
  test('код из /user_sign без аргументов принимается устройством', async () => {
    const db = makeDb()
    const signed = await userSignHandler({}, ctx(db))
    expect(signed.ok).toBe(true)
    const { code } = signed.data as { code: string }

    const res = await deviceRedeemHandler({ code, deviceId: 'dev-1' }, ctx(db))
    console.log('  redeem ->', JSON.stringify(res))
    expect(res.ok).toBe(true)
  })

  test('повторный вход тем же устройством по новому коду', async () => {
    const db = makeDb()
    const a = (await userSignHandler({}, ctx(db))).data as { code: string }
    await deviceRedeemHandler({ code: a.code, deviceId: 'dev-1' }, ctx(db))

    const b = (await userSignHandler({}, ctx(db))).data as { code: string }
    const res = await deviceRedeemHandler({ code: b.code, deviceId: 'dev-1' }, ctx(db))
    console.log('  повторный ->', JSON.stringify(res))
    expect(res.ok).toBe(true)
  })
})
