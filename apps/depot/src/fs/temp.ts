import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { depotLogger } from '../log'

const logger = depotLogger.sub('fs', 'temp')

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
    exists,
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
