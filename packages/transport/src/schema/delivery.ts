import { z } from 'zod'
import { spotterEventSchema } from './spotterEvent'

/**
 * server → telegram: render/update an event notification in all subscribed chats.
 *
 * `create` — new event, send a new message to every chat.
 * `update` — event updated (e.g. start→end), edit existing messages.
 * `media`  — transcoded media ready; send media group to subscribers.
 */
export const deliveryEventSchema = z.object({
  eventId: z.string().min(1),
  event: spotterEventSchema,
  clipKey: z.string().min(1).optional(),
  snapshotKey: z.string().min(1).optional(),
  action: z.enum(['create', 'update', 'media']),
})
export type DeliveryEvent = z.infer<typeof deliveryEventSchema>

/**
 * server → telegram: a recipient's role changed or they were revoked.
 * telegram uses this to keep its cached `tg_bindings.role` in sync.
 *
 * `update` — role changed; `revoke` — recipient deleted (role = null).
 */
export const deliveryRecipientSchema = z.object({
  recipientUuid: z.string().min(1),
  role: z.string().nullable(),
  action: z.enum(['update', 'revoke']),
})
export type DeliveryRecipient = z.infer<typeof deliveryRecipientSchema>

/**
 * telegram → server: a domain-mutating request (login, role change, …).
 * `instanceId` lets server route the reply back to the originating instance.
 */
export const commandRequestSchema = z.object({
  requestId: z.string().min(1),
  instanceId: z.string().min(1),
  kind: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  principalUuid: z.string().min(1).optional(),
})
export type CommandRequest = z.infer<typeof commandRequestSchema>

/** server → telegram: reply to a CommandRequest, correlated by requestId. */
export const commandReplySchema = z.object({
  requestId: z.string().min(1),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
})
export type CommandReply = z.infer<typeof commandReplySchema>

/** Canonical stream names for the server↔telegram delivery layer. */
export const deliveryStreams = {
  /** Event notifications: create / update / media. */
  deliveryEvent: 'spotter.delivery.event',
  /** Recipient role changes and revocations. */
  deliveryRecipient: 'spotter.delivery.recipient',
  /** Domain-mutating commands from telegram to server. */
  commandRequest: 'spotter.command.request',
  /** Server replies to CommandRequests, correlated by requestId. */
  commandReply: 'spotter.command.reply',
} as const

export const safeParseDeliveryEvent = (
  value: unknown,
): DeliveryEvent | null => {
  const result = deliveryEventSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseDeliveryRecipient = (
  value: unknown,
): DeliveryRecipient | null => {
  const result = deliveryRecipientSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseCommandRequest = (
  value: unknown,
): CommandRequest | null => {
  const result = commandRequestSchema.safeParse(value)
  return result.success ? result.data : null
}

export const safeParseCommandReply = (value: unknown): CommandReply | null => {
  const result = commandReplySchema.safeParse(value)
  return result.success ? result.data : null
}
