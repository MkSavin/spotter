import { type logCreator, logLevel } from 'kafkajs'
import { type StenographLevel, defaultLogger } from 'stenograph'

export const depotLogger = defaultLogger.sub('depot')

const translateLevel = (level: logLevel): StenographLevel => {
  switch (level) {
    case logLevel.ERROR:
    case logLevel.NOTHING:
      return 'error'
    case logLevel.WARN:
      return 'warn'
    case logLevel.INFO:
      return 'info'
    case logLevel.DEBUG:
      return 'debug'
  }
}

export const logging: logCreator =
  () =>
  ({ namespace, level, log }) => {
    depotLogger
      .sub(namespace.toLowerCase(), log.timestamp)
      .some(translateLevel(level), log.message)
  }
