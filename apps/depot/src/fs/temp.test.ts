import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, utimesSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { sweepStale, temp } from './temp'

describe('temp helper', () => {
  test('creates temporary directory with prefix and removes it', async () => {
    const prefix = 'spotter-temp-test-'
    const controller = await temp(prefix)
    try {
      expect(controller.exists).toBe(true)
      expect(controller.directory).toBeTruthy()
      // directory name should contain the prefix
      const baseName = path.basename(controller.directory)
      expect(baseName.startsWith(prefix)).toBe(true)

      // ensure it exists on FS
      const stat = await fs.stat(controller.directory)
      expect(stat.isDirectory()).toBe(true)

      // removal
      await controller.remove()
      expect(controller.exists).toBe(false)

      let threw = false
      try {
        await fs.stat(controller.directory)
      } catch (_err) {
        threw = true
      }
      expect(threw).toBe(true)
    } finally {
      // best-effort cleanup
      try {
        if (controller.directory) {
          await fs.rm(controller.directory, { recursive: true, force: true })
        }
      } catch (_) {
        // ignore
      }
    }
  })
})

describe('sweepStale', () => {
  test('removes an old directory left by a killed run', async () => {
    const prefix = `spotter-sweep-${crypto.randomUUID()}-`
    const stale = path.join(tmpdir(), `${prefix}old`)
    mkdirSync(stale)
    const past = new Date(Date.now() - 7_200_000)
    utimesSync(stale, past, past)

    expect(await sweepStale(prefix)).toBe(1)
    expect(existsSync(stale)).toBe(false)
  })

  test('leaves a fresh directory alone: a sibling replica may own it', async () => {
    const prefix = `spotter-sweep-${crypto.randomUUID()}-`
    const fresh = mkdtempSync(path.join(tmpdir(), prefix))

    expect(await sweepStale(prefix)).toBe(0)
    expect(existsSync(fresh)).toBe(true)
  })

  test('ignores directories belonging to another prefix', async () => {
    const mine = `spotter-sweep-${crypto.randomUUID()}-`
    const other = path.join(tmpdir(), `spotter-other-${crypto.randomUUID()}`)
    mkdirSync(other)
    const past = new Date(Date.now() - 7_200_000)
    utimesSync(other, past, past)

    expect(await sweepStale(mine)).toBe(0)
    expect(existsSync(other)).toBe(true)
  })
})
