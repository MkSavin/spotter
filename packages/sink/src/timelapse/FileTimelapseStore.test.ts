import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultLogger } from 'stenograph'
import { FileTimelapseStore } from './FileTimelapseStore'
import type { TimelapseJobRecord } from './TimelapseTracker'

defaultLogger.disable()

const record = (jobId: string): TimelapseJobRecord => ({
  jobId,
  request: {
    source: 'frigate',
    camera: 'front',
    start: 1_700_000_000,
    end: 1_700_003_600,
    speed: 'timelapse',
  },
  startedAt: Date.now(),
})

const tempFile = () =>
  path.join(tmpdir(), `spotter-tl-${crypto.randomUUID()}`, 'exports.json')

describe('FileTimelapseStore', () => {
  test('survives the process: a new instance reads what the old one wrote', async () => {
    const file = tempFile()

    const first = new FileTimelapseStore(file, defaultLogger)
    await first.put(record('front_a'))

    const second = new FileTimelapseStore(file, defaultLogger)
    expect((await second.list()).map((entry) => entry.jobId)).toEqual([
      'front_a',
    ])
  })

  test('drop removes the record', async () => {
    const file = tempFile()
    const store = new FileTimelapseStore(file, defaultLogger)

    await store.put(record('front_a'))
    await store.put(record('front_b'))
    await store.drop('front_a')

    expect((await store.list()).map((entry) => entry.jobId)).toEqual([
      'front_b',
    ])
  })

  test('a missing file is an empty store, not a failure', async () => {
    const store = new FileTimelapseStore(tempFile(), defaultLogger)
    expect(await store.list()).toEqual([])
  })

  test('starts clean on a corrupted file rather than refusing to run', async () => {
    const file = tempFile()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{ this is not json', 'utf8')

    const store = new FileTimelapseStore(file, defaultLogger)
    expect(await store.list()).toEqual([])

    // And it recovers into a usable state.
    await store.put(record('front_a'))
    expect(await store.list()).toHaveLength(1)
  })

  test('concurrent writes do not lose records', async () => {
    const file = tempFile()
    const store = new FileTimelapseStore(file, defaultLogger)

    await Promise.all([
      store.put(record('front_a')),
      store.put(record('front_b')),
      store.put(record('front_c')),
    ])

    const reread = new FileTimelapseStore(file, defaultLogger)
    expect((await reread.list()).map((entry) => entry.jobId).sort()).toEqual([
      'front_a',
      'front_b',
      'front_c',
    ])
  })
})
