import {
  env,
  type RedisConfig,
  redactConfig,
  requireConfig,
  resolveRedisConfig,
} from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

export type S3Config = {
  host: string
  accessKey: string
  secretKey: string
  bucket: string
}

export type SmtpConfig = {
  host: string
  port: number
  /** TLS on connect (465). `false` → STARTTLS upgrade on 587/25. */
  secure: boolean
  user: string
  password: string
  /** Envelope/From header, e.g. `Spotter <alerts@example.com>`. */
  from: string
}

/**
 * `always`  — one email per `create` event, in parallel with other channels.
 * `fallback` — reserved for the cross-channel ACK-trigger (send only when the
 * primary channel wasn't acknowledged). The trigger is not built yet, so
 * `fallback` currently behaves like `always`; see AGENTS.md.
 */
export const EMAIL_MODES = ['always', 'fallback'] as const
export type EmailMode = (typeof EMAIL_MODES)[number]

export type Config = {
  timezone: string
  redis: RedisConfig
  smtp: SmtpConfig
  /** Mailboxes every event is sent to (addressing is channel-local). */
  recipients: string[]
  mode: EmailMode
  database: {
    path: string
  }
  s3: S3Config
  source: string
  presignExpiry: number
  /** Base URL of the PWA/web frontend for the "open event" deep link. */
  publicUrl: string
}

export const resolveConfig = (): Config => {
  const config: Config = {
    timezone: env.string('TZ', 'Europe/Moscow'),
    redis: resolveRedisConfig({
      group: 'spotter-email',
      clientId: information.name,
    }),
    smtp: {
      host: env.string('SMTP_HOST', ''),
      port: env.number('SMTP_PORT', 465),
      secure: env.boolean('SMTP_SECURE', true),
      user: env.string('SMTP_USER', ''),
      password: env.string('SMTP_PASSWORD', ''),
      from: env.string('SMTP_FROM', ''),
    },
    recipients: env.stringArray('EMAIL_RECIPIENTS', []),
    mode: env.enum('EMAIL_MODE', EMAIL_MODES, 'always'),
    database: {
      path: env.string('DATABASE_PATH', './data/email.sqlite'),
    },
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
    },
    source: env.string('SOURCE_ID', 'frigate'),
    presignExpiry: env.number('S3_PRESIGN_EXPIRY', 3600),
    publicUrl: env.string('PUBLIC_URL', ''),
  }

  requireConfig({
    REDIS_URL: config.redis.url,
    SMTP_HOST: config.smtp.host,
    SMTP_USER: config.smtp.user,
    SMTP_PASSWORD: config.smtp.password,
    SMTP_FROM: config.smtp.from,
    EMAIL_RECIPIENTS: config.recipients.length > 0 ? 'set' : '',
    S3_HOST: config.s3.host,
    S3_ACCESS: config.s3.accessKey,
    S3_SECRET: config.s3.secretKey,
  })

  applicationLogger.verbose('Using core configuration:', redactConfig(config))

  return config
}
