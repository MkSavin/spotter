import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { dir } from './dir'

describe('dir helper', () => {
  test('creates and removes directory', async () => {
    const base = tmpdir()
    const testPath = path.join(base, `spotter-dir-test-${Date.now()}`)

    const controller = await dir(testPath)
    try {
      expect(controller.exists).toBe(true)
      expect(controller.directory).toBe(testPath)

      // directory should exist on filesystem
      const stat = await fs.stat(testPath)
      expect(stat.isDirectory()).toBe(true)

      // remove and ensure it no longer exists
      await controller.remove()
      expect(controller.exists).toBe(false)

      // access should fail
      let threw = false
      try {
        await fs.stat(testPath)
      } catch (err) {
        threw = true
      }
      expect(threw).toBe(true)

      // remove again should be safe/no-op
      await controller.remove()
      expect(controller.exists).toBe(false)
    } finally {
      // best-effort cleanup in case of test failure
      try {
        await fs.rm(testPath, { recursive: true, force: true })
      } catch (_) {
        // ignore
      }
    }
  })
})
