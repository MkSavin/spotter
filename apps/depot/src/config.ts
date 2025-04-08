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

  s3: {
    host: string
    accessKey: string
    secretKey: string
    bucket: string
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
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
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

  if (!result.s3.host) {
    throw new Error('Bad configuration. No s3 host found.')
  }

  applicationLogger.verbose('Using core configuration:', result)

  return result
}
