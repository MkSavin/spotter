import { describe, expect, test } from 'bun:test'
import { bufferToJson } from './bufferToJson'

describe('bufferToJson helper', () => {
  test('Returns null on empty argument', () => {
    expect(bufferToJson(undefined)).toBeNull()
    expect(bufferToJson(null)).toBeNull()
  })

  test('Throws on parse error', () => {
    expect(() => {
      bufferToJson(Buffer.alloc(0))
    }).toThrow(/EOF/gi)

    expect(() => {
      bufferToJson(Buffer.from('#', 'utf-8'))
    }).toThrow(/Unrecognized/gi)

    expect(() => {
      bufferToJson(Buffer.from('{', 'utf-8'))
    }).toThrow(/Expected/gi)

    expect(() => {
      bufferToJson(Buffer.from('{}', 'utf-8'))
    }).not.toThrow()

    expect(() => {
      bufferToJson(Buffer.from('{ "data" : "value" }', 'utf-8'))
    }).not.toThrow()
  })

  test('Returns proper result', () => {
    expect(bufferToJson(Buffer.from('{ "data" : "value" }', 'utf-8'))).toEqual({
      data: 'value',
    })
  })
})
