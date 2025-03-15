import { describe, expect, test } from 'bun:test'
import { env } from './env'

process.env = {
  ...process.env,
  TEST_STRING: 'test',
  TEST_NUMBER: '10',
  TEST_BOOLEAN_NEGATIVE: 'false',
  TEST_BOOLEAN_POSITIVE: 'true',
  TEST_BOOLEAN_SOMETHING: 'truetrue',
  TEST_ARRAY: 'test,test,test;test|test',
}

describe('env helper', () => {
  test('Returns proper string value', () => {
    expect(env.string('TEST_STRING', 'default')).toBe('test')
    expect(env.string('TEST_NUMBER', 'default')).toBe('10')
    expect(env.string('TEST_NOT_FOUND', 'default')).toBe('default')
  })

  test('Returns proper number value', () => {
    expect(env.number('TEST_NUMBER', 0)).toBe(10)
    expect(env.number('TEST_STRING', 0)).toBe(0)
    expect(env.number('TEST_NOT_FOUND', 0)).toBe(0)
  })

  test('Returns proper boolean value', () => {
    expect(env.boolean('TEST_BOOLEAN_NEGATIVE', true)).toBe(false)
    expect(env.boolean('TEST_BOOLEAN_POSITIVE', false)).toBe(true)
    expect(env.boolean('TEST_BOOLEAN_SOMETHING', false)).toBe(false)
    expect(env.boolean('TEST_STRING', false)).toBe(false)
    expect(env.boolean('TEST_NOT_FOUND', false)).toBe(false)
  })

  test('Returns proper string[] value', () => {
    expect(env.stringArray('TEST_ARRAY', [])).toStrictEqual([
      'test',
      'test',
      'test;test|test',
    ])
    expect(env.stringArray('TEST_ARRAY', [], '|')).toStrictEqual([
      'test,test,test;test',
      'test',
    ])
    expect(env.stringArray('TEST_STRING', ['foo'])).toStrictEqual(['test'])
    expect(env.stringArray('TEST_STRING', ['foo'], '|')).toStrictEqual(['test'])
    expect(env.stringArray('TEST_NOT_FOUND', ['foo'])).toStrictEqual(['foo'])
  })
})
