import { beforeEach, describe, expect, test } from 'bun:test'
import { type BotDatabase, createDatabase } from '../db/client'
import { tokensRepo, usersRepo } from '../db/repository'
import { deepLink, generateCode, redeemToken } from './token'

describe('access codes', () => {
  test('generateCode is short and URL/deep-link safe', () => {
    const code = generateCode()
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(code.length).toBeLessThanOrEqual(64)
    expect(generateCode()).not.toBe(code)
  })

  test('deepLink targets the bot with a start payload', () => {
    expect(deepLink('spotter_bot', 'abc')).toBe(
      'https://t.me/spotter_bot?start=abc',
    )
  })
})

describe('redeemToken', () => {
  let db: BotDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
  })

  test('unbound token: provisions the user with the granted role, single-use', () => {
    tokensRepo.create(db, { id: 'code-1', role: 'USER' })

    const result = redeemToken(db, 'code-1', {
      userId: '42',
      chatId: '42',
      username: 'Alice',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.role).toBe('USER')

    // user persisted with normalized username
    const user = usersRepo.findByRef(db, '42')
    expect(user?.username).toBe('alice')
    expect(user?.role).toBe('USER')

    // token consumed → cannot be reused
    expect(tokensRepo.find(db, 'code-1')).toBeUndefined()
    expect(
      redeemToken(db, 'code-1', {
        userId: '7',
        chatId: '7',
        username: undefined,
      }).ok,
    ).toBe(false)
  })

  test('unknown code: not-found', () => {
    const result = redeemToken(db, 'nope', {
      userId: '1',
      chatId: '1',
      username: undefined,
    })
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  test('bound token: only the matching username may redeem', () => {
    tokensRepo.create(db, { id: 'bound', role: 'VIEWER', username: 'bob' })

    const mismatch = redeemToken(db, 'bound', {
      userId: '1',
      chatId: '1',
      username: 'alice',
    })
    expect(mismatch).toEqual({ ok: false, reason: 'username-mismatch' })
    // rejected redeem must not consume the token
    expect(tokensRepo.find(db, 'bound')).toBeDefined()

    const ok = redeemToken(db, 'bound', {
      userId: '2',
      chatId: '2',
      username: '@Bob',
    })
    expect(ok.ok).toBe(true)
    expect(tokensRepo.find(db, 'bound')).toBeUndefined()
  })

  test('bound token: user without a username cannot redeem', () => {
    tokensRepo.create(db, { id: 'bound', role: 'VIEWER', username: 'bob' })
    const result = redeemToken(db, 'bound', {
      userId: '1',
      chatId: '1',
      username: undefined,
    })
    expect(result).toEqual({ ok: false, reason: 'username-mismatch' })
  })
})
