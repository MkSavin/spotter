import { describe, expect, test } from 'bun:test'
import { Role } from '../../db/schema'
import { canAccess, isVisible } from './access'

describe('command access', () => {
  test('all: everyone, including anonymous', () => {
    expect(canAccess('all', undefined)).toBe(true)
    expect(canAccess('all', null)).toBe(true)
    expect(canAccess('all', Role.VIEWER)).toBe(true)
    expect(canAccess('all', Role.ADMIN)).toBe(true)
  })

  test('anonymous: only users without a role', () => {
    expect(canAccess('anonymous', undefined)).toBe(true)
    expect(canAccess('anonymous', null)).toBe(true)
    expect(canAccess('anonymous', Role.VIEWER)).toBe(false)
  })

  test('authorized: any role, not anonymous', () => {
    expect(canAccess('authorized', undefined)).toBe(false)
    expect(canAccess('authorized', Role.VIEWER)).toBe(true)
    expect(canAccess('authorized', Role.ADMIN)).toBe(true)
  })

  test('role requirement: that role or higher', () => {
    // VIEWER requirement
    expect(canAccess(Role.VIEWER, undefined)).toBe(false)
    expect(canAccess(Role.VIEWER, Role.VIEWER)).toBe(true)
    expect(canAccess(Role.VIEWER, Role.ADMIN)).toBe(true)

    // USER requirement: viewer is too low, user/admin pass
    expect(canAccess(Role.USER, Role.VIEWER)).toBe(false)
    expect(canAccess(Role.USER, Role.USER)).toBe(true)
    expect(canAccess(Role.USER, Role.ADMIN)).toBe(true)

    // ADMIN requirement: only admin
    expect(canAccess(Role.ADMIN, Role.USER)).toBe(false)
    expect(canAccess(Role.ADMIN, Role.ADMIN)).toBe(true)
  })

  test('isVisible mirrors canAccess', () => {
    expect(isVisible('anonymous', undefined)).toBe(true)
    expect(isVisible('anonymous', Role.ADMIN)).toBe(false)
    expect(isVisible(Role.USER, Role.ADMIN)).toBe(true)
  })
})
