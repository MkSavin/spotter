import { describe, expect, test } from 'bun:test'
import { mime } from './mime'

describe('extension helper', () => {
  test('Returns proper type', () => {
    expect(mime('image/jpg').type).toBe('image')
    expect(mime('video/mp4').type).toBe('video')
  })
  test('Returns proper extension', () => {
    expect(mime('image/jpg').extension()).toBe('jpg')
    expect(mime('video/mp4').extension()).toBe('mp4')
  })
})
