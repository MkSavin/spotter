import fs from 'node:fs/promises'
import { applicationLogger } from '../log'

const logger = applicationLogger.sub('fs', 'dir')

export type DirectoryController = {
  directory: string
  exists: boolean
  remove: () => Promise<void>
}

export const dir = async (path: string): Promise<DirectoryController> => {
  let exists = false

  try {
    await fs.mkdir(path, { recursive: true })
    exists = true
  } catch (error) {
    logger.error(error)
  }

  return {
    directory: path,
    // Getter, so callers observe the live state after remove(); a plain value
    // would be a snapshot frozen at construction time.
    get exists() {
      return exists
    },
    remove: async (): Promise<void> => {
      if (!exists) {
        return
      }

      try {
        await fs.rm(path, {
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
