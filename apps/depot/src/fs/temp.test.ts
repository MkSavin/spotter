import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import path from 'node:path'

import { temp } from './temp'

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
      } catch (err) {
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
