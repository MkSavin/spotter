import { type InferSelectModel, sql } from 'drizzle-orm'
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

// Ordered from least to most privileged: anonymous (no row) < VIEWER < USER < ADMIN.
export const ROLES = ['VIEWER', 'USER', 'ADMIN'] as const

export type Role = (typeof ROLES)[number]

// Value object mirroring the old Prisma enum, so `Role.ADMIN` keeps working
// alongside `Role` used as a type.
export const Role = {
  VIEWER: 'VIEWER',
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const satisfies Record<Role, Role>

// Privilege rank used by the command access system (anonymous = 0).
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  USER: 2,
  ADMIN: 3,
}

const authorizedAt = integer('authorized_at', { mode: 'timestamp_ms' })
  .notNull()
  .default(sql`(unixepoch() * 1000)`)

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  token: text('token').notNull(),
  authorizedAt,
})

export const users = sqliteTable(
  'users',
  {
    id: text('id').notNull(),
    chatId: text('chat_id').notNull(),
    // Telegram @username (normalized, lowercase, no leading @). Nullable: not
    // every Telegram account has one. Used to address users in admin commands.
    username: text('username'),
    role: text('role', { enum: ROLES }).notNull().default('VIEWER'),
    token: text('token').notNull(),
    authorizedAt,
  },
  // Composite PK (id, chat_id): one user may be authorized in multiple chats.
  (table) => [primaryKey({ columns: [table.id, table.chatId] })],
)

// Single-use access tokens minted by /user_sign (or the CLI bootstrap). Redeemed
// via /login or the /start deep-link, then deleted. The granted role is always
// VIEWER from the bot; the CLI may mint higher roles to bootstrap the first admin.
export const accessTokens = sqliteTable('access_tokens', {
  id: text('id').primaryKey(),
  role: text('role', { enum: ROLES }).notNull().default('VIEWER'),
  // Optional binding: only a user with this normalized @username may redeem it.
  username: text('username'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

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
})

// Replaces the embedded `Event.messages` array from the Mongo schema.
export const eventMessages = sqliteTable(
  'event_messages',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').notNull(),
    messageId: integer('message_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.chatId] })],
)

export type Chat = InferSelectModel<typeof chats>
export type User = InferSelectModel<typeof users>
export type AccessToken = InferSelectModel<typeof accessTokens>
export type Event = InferSelectModel<typeof events>

// In-memory shape used across the bot (Telegram message id + chat id). Maps to
// an `event_messages` row, but keeps the field names the rest of the code uses.
export type EventMessage = {
  id: number
  chatId: string
}
