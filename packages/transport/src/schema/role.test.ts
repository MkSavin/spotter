import { describe, expect, test } from 'bun:test'
import { isRole, ROLE_RANK, satisfies } from './role'

describe('role vocabulary', () => {
  test('ranks ascend from viewer to admin', () => {
    expect(ROLE_RANK.VIEWER).toBeLessThan(ROLE_RANK.USER)
    expect(ROLE_RANK.USER).toBeLessThan(ROLE_RANK.ADMIN)
  })

  test('a higher role satisfies a lower requirement', () => {
    expect(satisfies('USER', 'ADMIN')).toBe(true)
    expect(satisfies('USER', 'USER')).toBe(true)
    expect(satisfies('USER', 'VIEWER')).toBe(false)
  })

  test('authorized accepts any role and nothing else', () => {
    expect(satisfies('authorized', 'VIEWER')).toBe(true)
    expect(satisfies('authorized', null)).toBe(false)
  })

  test('anonymous is the inverse', () => {
    expect(satisfies('anonymous', null)).toBe(true)
    expect(satisfies('anonymous', 'VIEWER')).toBe(false)
  })

  test('isRole rejects anything not in the vocabulary', () => {
    expect(isRole('ADMIN')).toBe(true)
    expect(isRole('admin')).toBe(false)
    expect(isRole(undefined)).toBe(false)
  })
})
