import fs from 'node:fs/promises'
import { defaultLogger } from 'stenograph'

const logger = defaultLogger.sub('fs', 'dir')

type DirectoryController = {
  directory: string
  exists: boolean
  remove: () => Promise<void>
}

export const dir = async (path: string): Promise<DirectoryController> => {
  let exists = false

  try {
    await fs.mkdir(path)
    exists = true
  } catch (error) {
    logger.error(error)
  }

  return {
    directory: path,
    exists,
    remove: async (): Promise<void> => {
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
