import { beforeEach, describe, expect, test } from 'bun:test'
import { createDatabase, type ServerDatabase } from '../db/client'
import { recipientsRepo } from '../db/repository'
import { authorizeCommand } from './authorize'
import { commandAccess } from './handlers'

let db: ServerDatabase

beforeEach(() => {
  db = createDatabase(':memory:')
})

const makeRecipient = (role: 'VIEWER' | 'USER' | 'ADMIN'): string => {
  const uuid = `uuid-${role}`
  recipientsRepo.upsertByTgUserId(db, {
    uuid,
    tgUserId: `tg-${role}`,
    username: null,
    role,
  })
  return uuid
}

describe('authorizeCommand', () => {
  test('anonymous kinds pass without a principal', () => {
    expect(
      authorizeCommand(db, 'login.redeem', undefined, commandAccess).ok,
    ).toBe(true)
  })

  test('unknown kind is rejected', () => {
    expect(authorizeCommand(db, 'no.such', undefined, commandAccess)).toEqual({
      ok: false,
      error: 'unknown-kind',
    })
  })

  test('privileged kind without a principal is forbidden', () => {
    expect(
      authorizeCommand(db, 'user.setRole', undefined, commandAccess),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  test('privileged kind with an unknown principal uuid is forbidden', () => {
    expect(
      authorizeCommand(db, 'user.setRole', 'ghost', commandAccess),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  test('below-rank principal is forbidden, ADMIN is allowed', () => {
    const viewer = makeRecipient('VIEWER')
    const admin = makeRecipient('ADMIN')

    expect(authorizeCommand(db, 'user.setRole', viewer, commandAccess)).toEqual(
      { ok: false, error: 'forbidden' },
    )
    expect(authorizeCommand(db, 'user.setRole', admin, commandAccess).ok).toBe(
      true,
    )
  })

  test('authorized-tier kind accepts any known recipient', () => {
    const viewer = makeRecipient('VIEWER')
    expect(authorizeCommand(db, 'event.clip', viewer, commandAccess).ok).toBe(
      true,
    )
    expect(
      authorizeCommand(db, 'event.clip', undefined, commandAccess),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})
