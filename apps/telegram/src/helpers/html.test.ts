import { describe, expect, test } from 'bun:test'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  test('neutralises the characters Telegram parses as markup', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  test('escapes the ampersand first so entities are not doubled', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;')
  })

  test('leaves ordinary values untouched', () => {
    expect(escapeHtml('@vasya')).toBe('@vasya')
    expect(escapeHtml('cam-1700000000.123-abc')).toBe('cam-1700000000.123-abc')
  })
})
