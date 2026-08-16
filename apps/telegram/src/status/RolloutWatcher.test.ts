import { beforeEach, describe, expect, test } from 'bun:test'
import type { Heartbeat } from '@spotter/transport'
import { Stenograph } from 'stenograph'
import { createDatabase, type TelegramDatabase } from '../db/client'
import { serviceVersionsRepo } from '../db/repository'
import { type RolloutChange, RolloutWatcher } from './RolloutWatcher'

const beat = (service: string, version: string, node = 'cloud'): Heartbeat => ({
  service,
  version,
  node,
  uptime: 1,
  at: Date.now(),
})

const silent = new Stenograph({ transport: [] })

describe('RolloutWatcher', () => {
  let db: TelegramDatabase
  let sent: RolloutChange[][]

  const watcher = (debounceMs = 1): RolloutWatcher =>
    new RolloutWatcher(db, silent, {
      debounceMs,
      onRollout: (changes) => sent.push(changes),
    })

  const settle = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 20))

  beforeEach(() => {
    db = createDatabase(':memory:')
    sent = []
  })

  test('stays silent when a service is seen for the first time', async () => {
    const watch = watcher()
    watch.apply(beat('telegram', '1.0.0'))
    await settle()

    expect(sent).toEqual([])
    // Recorded all the same, so the next change is detected.
    expect(serviceVersionsRepo.list(db)).toHaveLength(1)
  })

  test('reports a version change', async () => {
    const watch = watcher()
    watch.apply(beat('telegram', '1.0.0'))
    watch.apply(beat('telegram', '1.1.0'))
    await settle()

    expect(sent).toEqual([
      [{ node: 'cloud', service: 'telegram', from: '1.0.0', to: '1.1.0' }],
    ])
  })

  test('stays silent while the version repeats', async () => {
    const watch = watcher()
    watch.apply(beat('telegram', '1.0.0'))
    watch.apply(beat('telegram', '1.0.0'))
    watch.apply(beat('telegram', '1.0.0'))
    await settle()

    expect(sent).toEqual([])
  })

  test('coalesces one rollout into a single message', async () => {
    const watch = watcher(30)
    for (const service of ['telegram', 'frigate', 'depot'])
      watch.apply(beat(service, '1.0.0'))
    await settle()

    for (const service of ['telegram', 'frigate', 'depot'])
      watch.apply(beat(service, '2.0.0'))
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(3)
    // Sorted, so the message reads the same every time.
    expect(sent[0]?.map((change) => change.service)).toEqual([
      'depot',
      'frigate',
      'telegram',
    ])
  })

  test('keeps the original version when one service hops twice', async () => {
    const watch = watcher(30)
    watch.apply(beat('telegram', '1.0.0'))
    await settle()

    watch.apply(beat('telegram', '1.1.0'))
    watch.apply(beat('telegram', '1.2.0'))
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(sent).toEqual([
      [{ node: 'cloud', service: 'telegram', from: '1.0.0', to: '1.2.0' }],
    ])
  })

  test('survives a restart: versions come back from the database', async () => {
    const first = watcher()
    first.apply(beat('telegram', '1.0.0'))
    await settle()
    first.stop()

    // A brand new watcher on the same database — as after a bot restart.
    const second = watcher()
    second.apply(beat('telegram', '1.0.0'))
    await settle()
    expect(sent).toEqual([])

    second.apply(beat('telegram', '1.1.0'))
    await settle()
    expect(sent).toEqual([
      [{ node: 'cloud', service: 'telegram', from: '1.0.0', to: '1.1.0' }],
    ])
  })

  test('tells apart the same service on different nodes', async () => {
    const watch = watcher()
    watch.apply(beat('depot', '1.0.0', 'cloud'))
    watch.apply(beat('depot', '1.0.0', 'ingest'))
    await settle()
    expect(sent).toEqual([])

    watch.apply(beat('depot', '1.1.0', 'ingest'))
    await settle()
    expect(sent).toEqual([
      [{ node: 'ingest', service: 'depot', from: '1.0.0', to: '1.1.0' }],
    ])
  })
})
