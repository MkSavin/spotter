import fs from 'node:fs/promises'
import path from 'node:path'
import { defaultLogger } from 'stenograph'

const logger = defaultLogger.sub('fs', 'temp')

type TempDirectoryController = {
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
    directory = await fs.mkdtemp(
      path.resolve('/tmp/spotter-depot/', Bun.hash(prefix).toString()),
    )
    exists = true
  } catch (error) {
    logger.error(error)
  }

  return {
    directory,
    exists,
    remove: async (): Promise<void> => {
      if (directory) {
        try {
          await fs.rm(directory, {
            recursive: true,
            force: true,
          })
        } catch (error) {
          logger.error(error)
        }
        exists = false
      }
    },
  }
}
