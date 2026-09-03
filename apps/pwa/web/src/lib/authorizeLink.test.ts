import { describe, expect, test } from 'bun:test'
import { codeFromLocation } from './authorizeLink'

const at = (pathname: string, search: string) => ({ pathname, search })

describe('codeFromLocation', () => {
  test('reads the code the bot handed over', () => {
    expect(codeFromLocation(at('/authorize', '?code=xK3p-Rd9Qm2A'))).toBe(
      'xK3p-Rd9Qm2A',
    )
  })

  test('ignores every other route', () => {
    // Otherwise a `?code=` on the feed would silently re-authorize the install.
    expect(codeFromLocation(at('/', '?code=xK3p'))).toBeNull()
    expect(codeFromLocation(at('/status', '?code=xK3p'))).toBeNull()
  })

  test('a link with no code is not a login attempt', () => {
    expect(codeFromLocation(at('/authorize', ''))).toBeNull()
    expect(codeFromLocation(at('/authorize', '?code='))).toBeNull()
  })

  test('trims what a messaging app may have padded', () => {
    expect(codeFromLocation(at('/authorize', '?code=%20xK3p%20'))).toBe('xK3p')
  })

  test('survives a code containing url-escaped characters', () => {
    expect(codeFromLocation(at('/authorize', '?code=a%2Bb%2Fc'))).toBe('a+b/c')
  })
})
