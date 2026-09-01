import { describe, expect, test } from 'bun:test'
import { isNumericId, normalizeUsername } from './username'

describe('username normalization', () => {
  test('strips a leading @ and lowercases', () => {
    expect(normalizeUsername('@Ivan')).toBe('ivan')
    expect(normalizeUsername('  IVAN ')).toBe('ivan')
  })

  test('the domain and the frontends agree on one form', () => {
    // Both sides look recipients up by this; drift here silently stops matches.
    expect(normalizeUsername('@Ivan')).toBe(normalizeUsername('ivan'))
  })

  test('isNumericId separates ids from usernames', () => {
    expect(isNumericId('12345')).toBe(true)
    expect(isNumericId(' 42 ')).toBe(true)
    expect(isNumericId('ivan')).toBe(false)
    expect(isNumericId('@42')).toBe(false)
  })
})
