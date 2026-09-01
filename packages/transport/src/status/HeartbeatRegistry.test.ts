import { describe, expect, test } from 'bun:test'
import { Stenograph } from 'stenograph'
import { HEARTBEAT_STALE_MS, type Heartbeat } from '../schema/heartbeat'
import { HeartbeatRegistry } from './HeartbeatRegistry'

// No transports: the registry only calls debug, and tests assert on state.
const logger = new Stenograph({ transport: [] })

const beat = (overrides: Partial<Heartbeat> = {}): Heartbeat => ({
  service: 'server',
  version: '1.0.0',
  node: 'cloud',
  uptime: 60,
  at: Date.now(),
  ...overrides,
})

describe('HeartbeatRegistry', () => {
  test('keeps the latest report per service', () => {
    const registry = new HeartbeatRegistry(logger)

    registry.apply(beat({ version: '1.0.0' }))
    registry.apply(beat({ version: '1.1.0' }))

    expect(registry.size).toBe(1)
    expect(registry.all()[0]?.version).toBe('1.1.0')
  })

  test('separates the same service on different nodes', () => {
    const registry = new HeartbeatRegistry(logger)

    registry.apply(beat({ service: 'depot', node: 'ingest' }))
    registry.apply(beat({ service: 'depot', node: 'cloud' }))

    expect(registry.size).toBe(2)
  })

  test('marks a stale report as offline', () => {
    const registry = new HeartbeatRegistry(logger)

    registry.apply(beat({ service: 'fresh' }))
    registry.apply(
      beat({ service: 'stale', at: Date.now() - HEARTBEAT_STALE_MS - 1000 }),
    )

    const byName = new Map(registry.all().map((s) => [s.service, s.online]))
    expect(byName.get('fresh')).toBe(true)
    expect(byName.get('stale')).toBe(false)
  })

  test('sorts by node then service', () => {
    const registry = new HeartbeatRegistry(logger)

    registry.apply(beat({ service: 'telegram', node: 'cloud' }))
    registry.apply(beat({ service: 'depot', node: 'ingest' }))
    registry.apply(beat({ service: 'server', node: 'cloud' }))

    expect(registry.all().map((s) => `${s.node}/${s.service}`)).toEqual([
      'cloud/server',
      'cloud/telegram',
      'ingest/depot',
    ])
  })
})
