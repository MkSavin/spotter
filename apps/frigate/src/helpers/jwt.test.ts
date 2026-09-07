import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import jwt from './jwt'

const secret = 'x'.repeat(64)

/**
 * Verifies the way Frigate's PyJWT does, rather than by calling our own
 * `verify`: a signature both sides encode identically passes a round-trip
 * while every other implementation rejects it, which is exactly the bug this
 * file exists to catch.
 */
const independentlyValid = (token: string, key = secret): boolean => {
  const [header, payload, signature] = token.split('.')
  const expected = createHmac('sha256', key)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return expected === signature
}

describe('jwt.sign', () => {
  test('produces a signature an outside verifier accepts', () => {
    const token = jwt.sign({ sub: 'admin' }, secret, { algorithm: 'HS256' })

    expect(independentlyValid(token)).toBe(true)
  })

  // 43 chars is base64url of 32 raw bytes; encoding the hex text gives 86.
  test('the signature is the raw digest, not its hex text', () => {
    const signature = jwt.sign({ sub: 'admin' }, secret).split('.')[2]

    expect(signature).toHaveLength(43)
  })

  test('a different secret does not validate', () => {
    const token = jwt.sign({ sub: 'admin' }, secret)

    expect(independentlyValid(token, 'y'.repeat(64))).toBe(false)
  })

  test('claims survive the round trip', () => {
    const token = jwt.sign({ sub: 'admin', exp: 2000000000 }, secret)

    expect(jwt.decode(token).payload).toMatchObject({
      sub: 'admin',
      exp: 2000000000,
    })
  })

  test('a token is three base64url segments', () => {
    const parts = jwt.sign({ sub: 'admin' }, secret).split('.')

    expect(parts).toHaveLength(3)
    for (const part of parts) expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('jwt.verify', () => {
  test('accepts what it signed', () => {
    const token = jwt.sign({ sub: 'admin' }, secret)

    expect(() => jwt.verify(token, secret)).not.toThrow()
  })

  test('rejects a tampered payload', () => {
    const [header, , signature] = jwt.sign({ sub: 'admin' }, secret).split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'root' })).toString(
      'base64url',
    )

    expect(() =>
      jwt.verify(`${header}.${forged}.${signature}`, secret),
    ).toThrow('Invalid signature')
  })

  test('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'admin', exp: 1000 }, secret)

    expect(() => jwt.verify(token, secret)).toThrow('Token expired')
  })
})
