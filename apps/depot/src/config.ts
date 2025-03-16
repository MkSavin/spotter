import { type HeartbeatProps, env } from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

const cleanupStrategies = ['file-processed', 'process-exited'] as const

export type CoreConfig = {
  kafka: HeartbeatProps & {
    clientId: string
    brokers: string[]
    groupId: string
  }

  minio: {
    host: string
    port: number
    ssl: boolean
    accessKey: string
    secretKey: string
  }

  directory: {
    cleanupStrategy: (typeof cleanupStrategies)[number]
  }
}

export const resolveConfig = (): CoreConfig => {
  const result: CoreConfig = {
    kafka: {
      clientId: env.string('KAFKA_CLIENT_ID', information.name),
      brokers: env.stringArray('KAFKA_BROKERS', []),
      groupId: env.string('KAFKA_GROUP_ID', 'spotter-depot'),
      heartbeat: env.number('KAFKA_ACTION_HEARTBEAT', 3000),
      timeout: env.number('KAFKA_ACTION_TIMEOUT', 30000),
    },
    minio: {
      host: env.string('MINIO_HOST', ''),
      port: env.number('MINIO_PORT', 9000),
      ssl: env.boolean('MINIO_SSL', false),
      accessKey: env.string('MINIO_ACCESS', ''),
      secretKey: env.string('MINIO_SECRET', ''),
    },
    directory: {
      cleanupStrategy: env.enum(
        'DIRECTORY_CLEANUP',
        cleanupStrategies,
        'file-processed',
      ),
    },
  }

  if (!result.kafka.brokers.length) {
    throw new Error('Bad configuration. No kafka brokers found.')
  }

  if (!result.minio.host) {
    throw new Error('Bad configuration. No minio host found.')
  }

  applicationLogger.verbose('Using core configuration:', result)

  return result
}
