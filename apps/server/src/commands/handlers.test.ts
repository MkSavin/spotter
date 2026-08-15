import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ServerContext } from '../context'
import { createDatabase, type ServerDatabase } from '../db/client'
import { recipientsRepo, tokensRepo } from '../db/repository'
import { applicationLogger } from '../log'
import { loginRedeemHandler, userSignHandler } from './handlers'

beforeAll(() => {
  applicationLogger.disable()
})

// Minimal context: login.redeem and user.sign only touch db + logger.
const makeContext = (db: ServerDatabase): ServerContext =>
  ({ db, logger: applicationLogger }) as unknown as ServerContext

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
