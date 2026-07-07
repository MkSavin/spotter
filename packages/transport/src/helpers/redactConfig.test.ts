import { describe, expect, test } from 'bun:test'
import { redactConfig } from './redactConfig'

describe('redactConfig', () => {
  test('masks secret-looking keys, keeps the rest', () => {
    const redacted = redactConfig({
      redis: { url: 'redis://x', group: 'g' },
      s3: { host: 'h', accessKey: 'AK', secretKey: 'SK', bucket: 'b' },
      telegram: { token: 'T', chatId: '1' },
    })

    expect(redacted).toEqual({
      redis: { url: 'redis://x', group: 'g' },
      s3: { host: 'h', accessKey: '***', secretKey: '***', bucket: 'b' },
      telegram: { token: '***', chatId: '1' },
    })
  })

  test('leaves empty/undefined secrets untouched (nothing to leak)', () => {
    expect(redactConfig({ secretKey: '', token: undefined })).toEqual({
      secretKey: '',
      token: undefined,
    })
  })

  test('does not mutate the source object', () => {
    const source = { token: 'T' }
    redactConfig(source)
    expect(source.token).toBe('T')
  })

  test('recurses into arrays', () => {
    expect(redactConfig({ items: [{ password: 'p' }] })).toEqual({
      items: [{ password: '***' }],
    })
  })
})
