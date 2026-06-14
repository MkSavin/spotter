import { describe, expect, test } from 'bun:test'
import { get } from './get'

describe('get helper', () => {
  test('returns value when key exists', () => {
    const obj = { a: 1, b: 'x' } as const

    const result = get(obj, 'a', 0 as any)

    expect(result).toBe(1)
  })

  test('returns default when key missing', () => {
    const obj = { a: 1 }

    const result = get(obj, 'b' as any, 42 as any)

    expect(result).toBe(42)
  })

  test('returns undefined when key exists with undefined value', () => {
    const obj = { a: undefined as unknown as number }

    const result = get(obj, 'a' as any, 99 as any)

    // since the key exists (in operator), the actual value (undefined) should be returned
    expect(result).toBeUndefined()
  })

  test('works with object defaults and nested values', () => {
    const obj = { nested: { x: 5 } }

    const result = get(obj, 'nested' as any, { x: 0 } as any)

    expect(result).toEqual({ x: 5 })
  })
})
