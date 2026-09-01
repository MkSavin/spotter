import { type InferSelectModel, sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const ROLES = ['VIEWER', 'USER', 'ADMIN'] as const
export type Role = (typeof ROLES)[number]

export const Role = {
  VIEWER: 'VIEWER',
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const satisfies Record<Role, Role>

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  USER: 2,
  ADMIN: 3,
}

const authorizedAt = integer('authorized_at', { mode: 'timestamp_ms' })
  .notNull()
  .default(sql`(unixepoch() * 1000)`)

/**
 * Logical recipients — one row per person, identified by UUID.
 * `tg_user_id` and `username` are nullable because non-TG frontends may
 * not have them; they're populated on first login via the telegram app.
 */
export const recipients = sqliteTable('recipients', {
  uuid: text('uuid').primaryKey(),
  role: text('role', { enum: ROLES }).notNull().default('VIEWER'),
  tgUserId: text('tg_user_id').unique(),
  /**
   * A PWA install that redeemed a code. Mutually exclusive with `tgUserId` in
   * practice: one identifies a Telegram account, the other a browser install,
   * and a recipient is created by whichever redeemed the code.
   */
  deviceId: text('device_id').unique(),
  username: text('username'),
  authorizedAt,
})

/**
 * Single-use access codes minted by `/user_sign` or the CLI.
 * Consumed (deleted) on first successful redeem.
 */
export const accessTokens = sqliteTable('access_tokens', {
  id: text('id').primaryKey(),
  role: text('role', { enum: ROLES }).notNull().default('VIEWER'),
  username: text('username'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

/** NVR events persisted by the domain. */
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  camera: text('camera').notNull(),
  label: text('label'),
  startTime: real('start_time').notNull(),
  endTime: real('end_time'),
  score: real('score').notNull(),
  stationary: integer('stationary', { mode: 'boolean' })
    .notNull()
    .default(false),
  hasClip: integer('has_clip', { mode: 'boolean' }).notNull().default(false),
  hasSnapshot: integer('has_snapshot', { mode: 'boolean' })
    .notNull()
    .default(false),
  type: text('type').notNull().default('start'),
  source: text('source'),
})

export type Recipient = InferSelectModel<typeof recipients>
export type AccessToken = InferSelectModel<typeof accessTokens>
export type Event = InferSelectModel<typeof events>
