import { describe, expect, test } from 'bun:test'
import { parseRange } from './media'

describe('parseRange', () => {
  test('без заголовка — не диапазон', () => {
    expect(parseRange(null)).toBeNull()
  })

  test('открытый диапазон: браузер просит всё с начала', () => {
    expect(parseRange('bytes=0-')).toEqual({ start: 0, end: undefined })
  })

  test('закрытый диапазон', () => {
    expect(parseRange('bytes=100-199')).toEqual({ start: 100, end: 199 })
  })

  test('перемотка: запрос с середины файла', () => {
    expect(parseRange('bytes=1048576-')).toEqual({
      start: 1048576,
      end: undefined,
    })
  })

  test('мусор игнорируется, а не роняет ответ', () => {
    expect(parseRange('bytes=abc-def')).toBeNull()
    expect(parseRange('items=0-10')).toBeNull()
    expect(parseRange('')).toBeNull()
  })

  test('перевёрнутый диапазон отвергается', () => {
    // end < start would produce a negative content-length.
    expect(parseRange('bytes=500-100')).toBeNull()
  })

  test('пробелы вокруг заголовка не мешают', () => {
    expect(parseRange('  bytes=0-99  ')).toEqual({ start: 0, end: 99 })
  })
})
