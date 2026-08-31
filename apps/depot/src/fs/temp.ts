import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { applicationLogger } from '../log'

const logger = applicationLogger.sub('fs', 'temp')

export type TempDirectoryController = {
  directory: string
  exists: boolean
  remove: () => Promise<void>
}

/**
 * Removes directories this prefix left behind. A killed process (SIGKILL after
 * the stop grace period, OOM) never runs its cleanup, and each start makes a
 * fresh `mkdtemp`, so the old ones would accumulate untouched.
 *
 * Only entries older than `minAgeMs` are touched: a sibling replica may be
 * using a directory created moments ago.
 */
export const sweepStale = async (
  prefix: string,
  minAgeMs = 3_600_000,
): Promise<number> => {
  let removed = 0

  try {
    const root = tmpdir()
    const entries = await fs.readdir(root, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue

      const full = path.join(root, entry.name)
      try {
        const stat = await fs.stat(full)
        if (Date.now() - stat.mtimeMs < minAgeMs) continue
        await fs.rm(full, { recursive: true, force: true })
        removed += 1
      } catch {
        // Another replica may have removed it first; nothing to report.
      }
    }
  } catch (error) {
    logger.warn('Could not sweep stale temp directories', error)
  }

  if (removed > 0) logger.info(`Removed ${removed} stale temp directory(ies)`)

  return removed
}

export const temp = async (
  prefix: string,
): Promise<TempDirectoryController> => {
  let directory = ''
  let exists = false

  try {
    directory = await fs.mkdtemp(path.join(tmpdir(), prefix))
    exists = true
  } catch (error) {
    logger.error(error)
  }

  return {
    directory,
    // Getter, so callers observe the live state after remove(); a plain value
    // would be a snapshot frozen at construction time.
    get exists() {
      return exists
    },
    remove: async (): Promise<void> => {
      if (!directory || !exists) {
        return
      }
      try {
        await fs.rm(directory, {
          recursive: true,
          force: true,
        })
      } catch (error) {
        logger.error(error)
      }
      exists = false
    },
  }
}
