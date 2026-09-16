import process from 'node:process'
import type { Stenograph } from 'stenograph'

/**
 * An unhandled rejection terminates a Bun process outright. Logging one is the
 * difference between a diagnosable bug and a container that silently restarts.
 */
export const guardRejections = (logger: Stenograph): void => {
  process.on('unhandledRejection', (reason) => {
    logger.error(reason)
  })
}
