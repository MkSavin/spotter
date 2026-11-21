import {
  env,
  requireConfig,
  resolveRedisConfig,
  resolveS3Config,
} from '@spotter/transport'
import information from '../package.json'

export const resolveConfig = () => {
  const token = env.string('APPERCOT_TOKEN', '')
  const url = env.string('APPERCOT_WS_URL', '')
  const s3 = resolveS3Config()
  requireConfig({
    APPERCOT_TOKEN: token,
    APPERCOT_WS_URL: url,
    S3_HOST: s3.host,
    S3_ACCESS: s3.accessKey,
    S3_SECRET: s3.secretKey,
  })
  if (!['ws:', 'wss:'].includes(URL.parse(url)?.protocol ?? '')) {
    throw new Error('APPERCOT_WS_URL must be a ws:// or wss:// URL')
  }
  const s3PublicUrl = env.string('APPERCOT_S3_PUBLIC_URL', s3.host)
  if (!['http:', 'https:'].includes(URL.parse(s3PublicUrl)?.protocol ?? '')) {
    throw new Error('APPERCOT_S3_PUBLIC_URL must be an http:// or https:// URL')
  }
  const redis = resolveRedisConfig({
    group: 'spotter-appercot',
    clientId: information.name,
  })
  return {
    token,
    url,
    redis,
    s3,
    s3PublicUrl,
    databasePath: env.string('DATABASE_PATH', './data/appercot.sqlite'),
    source: env.string('SOURCE_ID', 'frigate'),
    timezone: env.string('TZ', 'Europe/Moscow'),
    presignExpiry: env.number('S3_PRESIGN_EXPIRY', 3600),
    retentionMs: env.number('MESSAGE_RETENTION_DAYS', 30) * 86_400_000,
  }
}

export type Config = ReturnType<typeof resolveConfig>
