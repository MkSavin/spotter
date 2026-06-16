import { describe, expect, test } from 'bun:test'
import { deepLink } from './token'

describe('deepLink', () => {
  test('targets the bot with a start payload', () => {
    expect(deepLink('spotter_bot', 'abc')).toBe(
      'https://t.me/spotter_bot?start=abc',
    )
  })
})
