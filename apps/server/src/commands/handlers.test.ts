import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ServerContext } from '../context'
import { createDatabase, type ServerDatabase } from '../db/client'
import { recipientsRepo, tokensRepo } from '../db/repository'
import { applicationLogger } from '../log'
import {
  deviceRedeemHandler,
  loginRedeemHandler,
  userListHandler,
  userSignHandler,
} from './handlers'

beforeAll(() => {
  applicationLogger.disable()
})

const DAY_MS = 24 * 60 * 60 * 1000

// Minimal context: login.redeem and user.sign only touch db + logger + the
// access-code TTL.
const makeContext = (db: ServerDatabase, codeTtlMs = DAY_MS): ServerContext =>
  ({
    db,
    logger: applicationLogger,
    config: { auth: { codeTtlMs } },
  }) as unknown as ServerContext

describe('deviceRedeemHandler', () => {
  let db: ServerDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('missing args → fail', async () => {
    expect((await deviceRedeemHandler({ code: 'x' }, makeContext(db))).ok).toBe(
      false,
    )
    expect(
      (await deviceRedeemHandler({ deviceId: 'd1' }, makeContext(db))).ok,
    ).toBe(false)
  })

  test('unknown code → not-found', async () => {
    expect(
      await deviceRedeemHandler(
        { code: 'nope', deviceId: 'd1' },
        makeContext(db),
      ),
    ).toEqual({ ok: false, error: 'not-found' })
  })

  test('redeems a shared code and grants its role to the device', async () => {
    // The same pool of codes the bot uses: access is granted once, not once
    // per frontend.
    tokensRepo.create(db, { id: 'code-d', role: 'USER' })

    const reply = await deviceRedeemHandler(
      { code: 'code-d', deviceId: 'device-1' },
      makeContext(db),
    )

    expect(reply.ok).toBe(true)
    expect((reply.data as { role: string }).role).toBe('USER')

    // Single-use, exactly as for the bot.
    expect(tokensRepo.find(db, 'code-d')).toBeUndefined()
  })

  test('re-redeeming on the same device keeps one recipient', async () => {
    tokensRepo.create(db, { id: 'c1', role: 'VIEWER' })
    tokensRepo.create(db, { id: 'c2', role: 'ADMIN' })

    const first = await deviceRedeemHandler(
      { code: 'c1', deviceId: 'device-1' },
      makeContext(db),
    )
    const second = await deviceRedeemHandler(
      { code: 'c2', deviceId: 'device-1' },
      makeContext(db),
    )

    // Same recipient, upgraded role — not a second identity for one device.
    expect((second.data as { recipientUuid: string }).recipientUuid).toBe(
      (first.data as { recipientUuid: string }).recipientUuid,
    )
    expect((second.data as { role: string }).role).toBe('ADMIN')
  })

  test('refuses a code minted for a named Telegram user', async () => {
    // There is no username on a device to match it against, so honouring it
    // would hand a personal code to whoever typed it first.
    tokensRepo.create(db, { id: 'c-named', role: 'ADMIN', username: 'alice' })

    expect(
      await deviceRedeemHandler(
        { code: 'c-named', deviceId: 'device-1' },
        makeContext(db),
      ),
    ).toEqual({ ok: false, error: 'username-mismatch' })

    // And the code survives for its intended owner.
    expect(tokensRepo.find(db, 'c-named')).toBeDefined()
  })
})

describe('userListHandler', () => {
  let db: ServerDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('lists both kinds of recipient', async () => {
    recipientsRepo.upsertByTgUserId(db, {
      uuid: 'u-tg',
      tgUserId: '42',
      username: 'alice',
      role: 'ADMIN',
    })
    recipientsRepo.upsertByDeviceId(db, {
      uuid: 'u-dev',
      deviceId: 'device-1',
      role: 'USER',
    })

    const reply = await userListHandler({}, makeContext(db))
    const { users } = reply.data as {
      users: Array<{ uuid: string; deviceId: string | null }>
    }

    expect(users).toHaveLength(2)
    // A PWA recipient has no tgUserId; it must still be visible to manage.
    expect(users.find((user) => user.uuid === 'u-dev')?.deviceId).toBe(
      'device-1',
    )
  })

  test('an empty domain lists nobody rather than failing', async () => {
    const reply = await userListHandler({}, makeContext(db))
    expect((reply.data as { users: unknown[] }).users).toEqual([])
  })
})

describe('findByRef', () => {
  test('resolves a device recipient by uuid', () => {
    const db = createDatabase(':memory:')
    recipientsRepo.upsertByDeviceId(db, {
      uuid: 'u-dev',
      deviceId: 'device-1',
      role: 'USER',
    })

    // It has neither a tgUserId nor a username, so the uuid is the only handle
    // an admin can revoke it by.
    expect(recipientsRepo.findByRef(db, 'u-dev')?.uuid).toBe('u-dev')
  })
})

describe('loginRedeemHandler', () => {
  let db: ServerDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('missing args → fail', async () => {
    const reply = await loginRedeemHandler({ code: 'x' }, makeContext(db))
    expect(reply.ok).toBe(false)
  })

  test('unknown code → not-found', async () => {
    const reply = await loginRedeemHandler(
      { code: 'nope', tgUserId: '1', tgChatId: '1' },
      makeContext(db),
    )
    expect(reply).toEqual({ ok: false, error: 'not-found' })
  })

  test('unbound token: provisions recipient, single-use', async () => {
    tokensRepo.create(db, { id: 'code-1', role: 'USER' })
    const context = makeContext(db)

    const reply = await loginRedeemHandler(
      { code: 'code-1', tgUserId: '42', tgChatId: '42', username: 'Alice' },
      context,
    )

    expect(reply.ok).toBe(true)
    const data = reply.data as { role: string }
    expect(data.role).toBe('USER')

    // recipient persisted with normalized username
    const recipient = recipientsRepo.findByTgUserId(db, '42')
    expect(recipient?.username).toBe('alice')
    expect(recipient?.role).toBe('USER')

    // token consumed → cannot be reused
    expect(tokensRepo.find(db, 'code-1')).toBeUndefined()
    const reuse = await loginRedeemHandler(
      { code: 'code-1', tgUserId: '7', tgChatId: '7' },
      context,
    )
    expect(reuse.ok).toBe(false)
  })

  test('bound token: only the matching username may redeem', async () => {
    tokensRepo.create(db, { id: 'bound', role: 'VIEWER', username: 'bob' })
    const context = makeContext(db)

    const mismatch = await loginRedeemHandler(
      { code: 'bound', tgUserId: '1', tgChatId: '1', username: 'alice' },
      context,
    )
    expect(mismatch).toEqual({ ok: false, error: 'username-mismatch' })
    // rejected redeem must not consume the token
    expect(tokensRepo.find(db, 'bound')).toBeDefined()

    const ok = await loginRedeemHandler(
      { code: 'bound', tgUserId: '2', tgChatId: '2', username: '@Bob' },
      context,
    )
    expect(ok.ok).toBe(true)
    expect(tokensRepo.find(db, 'bound')).toBeUndefined()
  })
})

describe('access code expiry', () => {
  let db: ServerDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  const ageCode = (id: string, ageMs: number): void => {
    tokensRepo.create(db, { id, role: 'VIEWER' })
    db.$client
      .query('UPDATE access_tokens SET created_at = ? WHERE id = ?')
      .run(Date.now() - ageMs, id)
  }

  test('a code past its TTL is refused and consumed', async () => {
    ageCode('stale', 2 * DAY_MS)

    const reply = await loginRedeemHandler(
      { code: 'stale', tgUserId: '1', tgChatId: '1' },
      makeContext(db),
    )

    expect(reply.ok).toBe(false)
    expect(reply.error).toBe('expired')
    // Refusing it is not enough: an unusable code must not linger.
    expect(tokensRepo.find(db, 'stale')).toBeUndefined()
  })

  test('a code inside its TTL still works', async () => {
    ageCode('fresh', DAY_MS / 2)

    const reply = await loginRedeemHandler(
      { code: 'fresh', tgUserId: '1', tgChatId: '1' },
      makeContext(db),
    )

    expect(reply.ok).toBe(true)
  })

  test('device redemption honours the same window', async () => {
    ageCode('stale', 2 * DAY_MS)

    const reply = await deviceRedeemHandler(
      { code: 'stale', deviceId: 'd1' },
      makeContext(db),
    )

    expect(reply.error).toBe('expired')
  })

  test('retention drops codes nobody redeemed', () => {
    ageCode('old', 2 * DAY_MS)
    tokensRepo.create(db, { id: 'new', role: 'VIEWER' })

    expect(tokensRepo.prune(db, new Date(Date.now() - DAY_MS))).toBe(1)
    expect(tokensRepo.find(db, 'new')).toBeDefined()
  })
})

describe('userSignHandler', () => {
  test('mints a single-use, url-safe access code', async () => {
    const db = createDatabase(':memory:')
    const reply = await userSignHandler({ username: 'bob' }, makeContext(db))

    expect(reply.ok).toBe(true)
    const { code } = reply.data as { code: string }
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)

    // persisted and bound to the normalized username
    const token = tokensRepo.find(db, code)
    expect(token?.username).toBe('bob')
  })
})
