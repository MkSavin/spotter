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
