import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { jwtDecode, jwtSign, jwtVerify } from './jwt'

const base64UrlDecode = (s: string): string => {
  let str = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = str.length % 4
  if (pad) str += '='.repeat(4 - pad)
  return Buffer.from(str, 'base64').toString()
}

const FIXED_MS = 1_650_000_000_000 // deterministic timestamp

describe('jwt', () => {
  let realNow: typeof Date.now

  beforeEach(() => {
    realNow = Date.now
    Date.now = () => FIXED_MS
  })

  afterEach(() => {
    Date.now = realNow
  })

  describe('sign', () => {
    test('creates a token with iat and payload', () => {
      const token = jwtSign({ foo: 'bar' }, 'secret')
      const parts = token.split('.')
      expect(parts.length).toBe(3)

      const header = JSON.parse(base64UrlDecode(parts[0]))
      const payload = JSON.parse(base64UrlDecode(parts[1]))

      expect(header.alg).toBe('HS256')
      expect(header.typ).toBe('JWT')

      expect(payload.foo).toBe('bar')
      expect(payload.iat).toBe(Math.floor(FIXED_MS / 1000))
      expect(payload.exp).toBeUndefined()
      expect(payload.nbf).toBeUndefined()
      expect(parts[2].length).toBeGreaterThan(0)
    })

    test('handles expiresIn and notBefore (string and number)', () => {
      const token1 = jwtSign({}, 's', { expiresIn: '1h' })
      const payload1 = JSON.parse(base64UrlDecode(token1.split('.')[1]))
      expect(payload1.exp).toBe(payload1.iat + 3600)

      const token2 = jwtSign({}, 's', { notBefore: '5m' })
      const payload2 = JSON.parse(base64UrlDecode(token2.split('.')[1]))
      expect(payload2.nbf).toBe(payload2.iat + 300)

      const token3 = jwtSign({}, 's', { expiresIn: 120 })
      const payload3 = JSON.parse(base64UrlDecode(token3.split('.')[1]))
      expect(payload3.exp).toBe(payload3.iat + 120)
    })

    test('includes subject, jwtid, audience and issuer in token', () => {
      const token = jwtSign({ x: 1 }, 'k', {
        subject: 'subj',
        jwtid: 'myid',
        audience: ['a', 'b'],
        issuer: 'my-issuer',
        algorithm: 'HS512',
      })

      const parts = token.split('.')
      const header = JSON.parse(base64UrlDecode(parts[0]))
      const payload = JSON.parse(base64UrlDecode(parts[1]))

      expect(header.alg).toBe('HS512')
      expect(header.issuer).toBe('my-issuer')

      expect(payload.sub).toBe('subj')
      expect(payload.jti).toBe('myid')
      expect(payload.aud).toEqual(['a', 'b'])
      expect(payload.x).toBe(1)
    })

    test('throws on invalid expiresIn format', () => {
      expect(() => jwtSign({}, 'k', { expiresIn: '10x' as any })).toThrow()
    })
  })

  describe('decode', () => {
    test('returns header payload and signature', () => {
      const token = jwtSign({ foo: 'bar' }, 'secret')
      const decoded = jwtDecode(token)
      expect(decoded.header.alg).toBe('HS256')
      expect(decoded.payload.foo).toBe('bar')
      expect(typeof decoded.signature).toBe('string')
    })
  })

  describe('verify', () => {
    test('accepts valid token and rejects invalid signature', () => {
      const token = jwtSign({ v: 1 }, 'k', { algorithm: 'HS512' })
      const payload = jwtVerify(token, 'k')
      expect(payload.v).toBe(1)

      const parts = token.split('.')
      // corrupt signature
      const bad = `${parts[0]}.${parts[1]}.abc`
      expect(() => jwtVerify(bad, 'k')).toThrow()
    })

    test('checks exp and nbf', () => {
      const token = jwtSign({}, 's', { expiresIn: '1s' })
      Date.now = () => FIXED_MS + 2000

      try {
        expect(() => jwtVerify(token, 's')).toThrow('Token expired')
      } finally {
        Date.now = () => FIXED_MS
      }

      const token2 = jwtSign({}, 's', { notBefore: '5s' })
      // still at base -> not active
      expect(() => jwtVerify(token2, 's')).toThrow('Token not active')
    })

    test('checks issuer, audience and subject', () => {
      const token = jwtSign({ a: 1 }, 'k', {
        issuer: 'me',
        audience: ['x'],
        subject: 'sub',
      })

      // correct
      expect(
        jwtVerify(token, 'k', { issuer: 'me', audience: ['x'], subject: 'sub' })
          .a,
      ).toBe(1)
      // issuer mismatch
      expect(() => jwtVerify(token, 'k', { issuer: 'other' })).toThrow(
        'Invalid issuer',
      )
      // audience mismatch
      expect(() => jwtVerify(token, 'k', { audience: 'y' })).toThrow(
        'Invalid audience',
      )
      // subject mismatch
      expect(() => jwtVerify(token, 'k', { subject: 'nope' })).toThrow(
        'Invalid subject',
      )
    })
  })
})
