import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { log, setDebug } from './log'

const g = globalThis as Record<string, unknown>
let lines: Array<[string, unknown[]]>
let saved: Record<string, unknown>

beforeEach(() => {
  lines = []
  g.window = {}
  saved = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    console[level] = (...args: unknown[]) => lines.push([level, args])
  }
})

afterEach(() => {
  for (const [level, fn] of Object.entries(saved)) {
    ;(console as Record<string, unknown>)[level] = fn
  }
})

describe('log', () => {
  test('debug и info молчат, пока флаг не выставлен', () => {
    setDebug(false)
    lines = []

    log.debug('тихо')
    log.info('тоже тихо')

    expect(lines).toHaveLength(0)
  })

  test('warn и error печатаются всегда — их терять нельзя', () => {
    setDebug(false)
    lines = []

    log.warn('внимание')
    log.error('поломка')

    expect(lines.map(([level]) => level)).toEqual(['warn', 'error'])
  })

  test('с флагом печатается всё', () => {
    setDebug(true)
    lines = []

    log.debug('раз')
    log.info('два')

    expect(lines.map(([level]) => level)).toEqual(['debug', 'info'])
  })

  test('строка помечена префиксом pwa и временем', () => {
    setDebug(true)
    lines = []

    log.info('сообщение')

    const [, args] = lines[0]
    expect(String(args[0])).toMatch(
      /^\[pwa \d{2}:\d{2}:\d{2}\.\d{3}\] сообщение$/,
    )
  })

  test('поля передаются вторым аргументом, а не склеиваются в строку', () => {
    setDebug(true)
    lines = []

    log.info('с полями', { role: 'ADMIN' })

    expect(lines[0][1][1]).toEqual({ role: 'ADMIN' })
  })
})
