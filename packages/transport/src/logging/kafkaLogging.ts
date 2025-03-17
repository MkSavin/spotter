import { type logCreator, logLevel } from 'kafkajs'
import type { Stenograph, StenographLevel } from 'stenograph'

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

export const kafkaLogging =
  (logger: Stenograph): logCreator =>
  () =>
  ({ namespace, level, log }) => {
    const namespaceCode =
      typeof (namespace as unknown) === 'string'
        ? namespace.toLowerCase()
        : undefined

    logger
      .sub(namespaceCode ?? 'unknown', log.timestamp)
      .log(translateLevel(level), log.message)
  }
