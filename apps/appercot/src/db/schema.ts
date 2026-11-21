import type { MessageContent } from '@appercot/protocol'
import { ROLES } from '@spotter/transport/src/schema/role'
import type { SpotterEvent } from '@spotter/transport/src/schema/spotterEvent'
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  recipientUuid: text('recipient_uuid'),
  role: text('role', { enum: ROLES }),
  blocked: integer('blocked', { mode: 'boolean' }).notNull().default(false),
  mutedUntil: integer('muted_until'),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  event: text('event', { mode: 'json' }).$type<SpotterEvent>().notNull(),
  snapshotKey: text('snapshot_key'),
  clipKey: text('clip_key'),
  clipUntil: integer('clip_until'),
  clipStatus: text('clip_status'),
  updatedAt: integer('updated_at').notNull(),
})

export const eventMessages = sqliteTable(
  'event_messages',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').notNull(),
    messageId: text('message_id').notNull(),
    photoKey: text('photo_key'),
    fileId: text('file_id'),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.chatId] }),
    unique().on(t.chatId, t.messageId),
  ],
)

export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  recipientUuid: text('recipient_uuid').notNull(),
  messageId: text('message_id').notNull(),
  kind: text('kind', { enum: ['frame', 'timelapse', 'probe'] }).notNull(),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  key: text('key'),
  fileId: text('file_id'),
  outcome: text('outcome'),
  delivered: integer('delivered', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export const interactions = sqliteTable('interactions', {
  id: text('id').primaryKey(),
  content: text('content', { mode: 'json' }).$type<MessageContent>(),
  sent: integer('sent', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export const catalogs = sqliteTable('catalogs', {
  source: text('source').primaryKey(),
  snapshot: text('snapshot', { mode: 'json' }).$type<unknown>().notNull(),
})

export type Chat = typeof chats.$inferSelect
export type EventState = typeof events.$inferSelect
export type EventMessage = typeof eventMessages.$inferSelect
export type MediaRequestState = typeof requests.$inferSelect
