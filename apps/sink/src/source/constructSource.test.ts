import { describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { CoreConfig } from '../config'
import { FrigateSource } from './FrigateSource'
import { type SourceCode, constructSource } from './constructSource'

const config = {
  source: { type: 'frigate', frigate: { broker: 'mqtt://localhost:1883' } },
} as CoreConfig

describe('constructSource', () => {
  test('builds the FrigateSource for the frigate code', () => {
    const source = constructSource('frigate', config, defaultLogger)
    expect(source).toBeInstanceOf(FrigateSource)
    expect(source.code).toBe('frigate')
  })

  test('falls back to FrigateSource for unknown codes', () => {
    const source = constructSource(
      'unknown' as SourceCode,
      config,
      defaultLogger,
    )
    expect(source).toBeInstanceOf(FrigateSource)
  })
})
