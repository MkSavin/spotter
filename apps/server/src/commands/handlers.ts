import { randomBytes } from 'node:crypto'
import {
  type CommandReply,
  type DeliveryRecipient,
  type MediaRequest,
  deliveryStreams,
  eventCode,
  mediaStreams,
  resolveSource,
} from '@spotter/transport'
import type { ServerContext } from '../context'
import { eventsRepo, recipientsRepo, tokensRepo } from '../db/repository'
import { type Role, Role as RoleEnum } from '../db/schema'
import { parseRole } from '../helpers/role'
import { normalizeUsername } from '../helpers/username'

export type CommandHandler = (
  args: Record<string, unknown>,
  context: ServerContext,
) => Promise<Omit<CommandReply, 'requestId'>>

/**
 * Minimum access a principal needs to run a command kind.
 * `anonymous` — no principal required (login has no recipient yet);
 * `authorized` — any known recipient; a `Role` — that rank or higher.
 */
export type CommandAccess = 'anonymous' | 'authorized' | Role

const ok = (data?: unknown): Omit<CommandReply, 'requestId'> => ({
  ok: true,
  data,
})

const fail = (error: string): Omit<CommandReply, 'requestId'> => ({
  ok: false,
  error,
})

/** Redeems a single-use access code and upserts/returns the recipient. */
export const loginRedeemHandler: CommandHandler = async (args, context) => {
  const { db } = context
  const code = String(args.code ?? '').trim()
  const tgUserId = String(args.tgUserId ?? '').trim()
  const tgChatId = String(args.tgChatId ?? '').trim()
  const username = args.username
    ? normalizeUsername(String(args.username))
    : null

  if (!code || !tgUserId || !tgChatId) {
    return fail('Missing required args: code, tgUserId, tgChatId')
  }

  const token = tokensRepo.find(db, code)

  if (!token) {
    return fail('not-found')
  }

  if (token.username && token.username !== username) {
    return fail('username-mismatch')
  }

  const uuid = randomBytes(16).toString('hex')
  const recipient = recipientsRepo.upsertByTgUserId(db, {
    uuid,
    tgUserId,
    username,
    role: token.role,
  })

  tokensRepo.consume(db, token.id)

  context.logger
    .sub('auth')
    .info(`User "${tgUserId}" authorized as ${recipient.role} via access code`)

  return ok({
    recipientUuid: recipient.uuid,
    role: recipient.role,
    isNew: true,
  })
}

/** Changes a recipient's role; publishes a delivery.recipient event. */
export const userSetRoleHandler: CommandHandler = async (args, context) => {
  const { db, producer } = context
  const ref = String(args.ref ?? '').trim()
  const roleArg = String(args.role ?? '').trim()

  if (!ref || !roleArg) {
    return fail('Missing required args: ref, role')
  }

  const role = parseRole(roleArg)
  if (!role) {
    return fail(`Unknown role "${roleArg}"`)
  }

  const recipient = recipientsRepo.findByRef(db, ref)
  if (!recipient) {
    return fail('not-found')
  }

  const updated = recipientsRepo.setRole(db, recipient.uuid, role)
  if (!updated) {
    return fail('Update failed')
  }

  context.logger
    .sub('auth')
    .info(`Recipient "${recipient.uuid}" role changed to ${role}`)

  const delivery: DeliveryRecipient = {
    recipientUuid: recipient.uuid,
    role,
    action: 'update',
  }
  await producer.publish(deliveryStreams.deliveryRecipient, delivery)

  return ok({
    recipientUuid: recipient.uuid,
    tgUserId: recipient.tgUserId,
    newRole: role,
  })
}

/** Revokes a recipient entirely; publishes a delivery.recipient event. */
export const userRevokeHandler: CommandHandler = async (args, context) => {
  const { db, producer } = context
  const ref = String(args.ref ?? '').trim()

  if (!ref) {
    return fail('Missing required arg: ref')
  }

  const recipient = recipientsRepo.findByRef(db, ref)
  if (!recipient) {
    return fail('not-found')
  }

  recipientsRepo.remove(db, recipient.uuid)

  context.logger
    .sub('auth')
    .info(`Access revoked for recipient "${recipient.uuid}"`)

  const delivery: DeliveryRecipient = {
    recipientUuid: recipient.uuid,
    role: null,
    action: 'revoke',
  }
  await producer.publish(deliveryStreams.deliveryRecipient, delivery)

  return ok({ revokedUuid: recipient.uuid, tgUserId: recipient.tgUserId })
}

/** Mints a single-use access code. */
export const userSignHandler: CommandHandler = async (args, context) => {
  const { db } = context
  const usernameArg = args.username
    ? normalizeUsername(String(args.username))
    : null
  const code = randomBytes(9).toString('base64url')

  tokensRepo.create(db, {
    id: code,
    role: RoleEnum.VIEWER,
    username: usernameArg,
  })

  context.logger
    .sub('auth')
    .info(`Access code minted${usernameArg ? ` bound to @${usernameArg}` : ''}`)

  return ok({ code })
}

/** Returns event data by short code (for /event_info). */
export const eventInfoHandler: CommandHandler = async (args, context) => {
  const { db } = context
  const code = String(args.code ?? '').trim()

  if (!code) {
    return fail('Missing required arg: code')
  }

  const event = eventsRepo.findByCode(db, code, eventCode)

  if (!event) {
    return fail('not-found')
  }

  return ok({ event })
}

/** Clears all events. */
export const eventClearHandler: CommandHandler = async (_args, context) => {
  const count = eventsRepo.clear(context.db)
  context.logger.sub('events').info(`Events cleared: ${count}`)
  return ok({ count })
}

/**
 * On-demand clip transcode: requested when a recipient taps the "Видео" button.
 * Resolves the event's source and publishes a clip-only media request; the
 * transcoded result flows back through the normal media → delivery path.
 */
export const eventClipHandler: CommandHandler = async (args, context) => {
  const { db, producer } = context
  const eventId = String(args.eventId ?? '').trim()

  if (!eventId) {
    return fail('Missing required arg: eventId')
  }

  const event = eventsRepo.find(db, eventId)
  if (!event) {
    return fail('not-found')
  }
  if (!event.hasClip) {
    return fail('no-clip')
  }

  const source = resolveSource({ source: event.source ?? undefined })
  const request: MediaRequest = { eventId, source, want: ['clip'] }
  await producer.publish(mediaStreams.mediaRequest(source), request)

  context.logger
    .sub('media')
    .info(`Requested on-demand clip transcode for ${eventCode(eventId)}`)

  return ok()
}

/** Registry mapping command kind → handler. */
export const commandHandlers: Record<string, CommandHandler> = {
  'login.redeem': loginRedeemHandler,
  'user.setRole': userSetRoleHandler,
  'user.revoke': userRevokeHandler,
  'user.sign': userSignHandler,
  'event.info': eventInfoHandler,
  'event.clear': eventClearHandler,
  'event.clip': eventClipHandler,
}

/**
 * Minimum access each command kind requires. The domain enforces this itself
 * rather than trusting the frontend's own gate — anyone able to write to the
 * command stream still can't run a mutation above their role.
 */
export const commandAccess: Record<string, CommandAccess> = {
  'login.redeem': 'anonymous',
  'user.setRole': RoleEnum.ADMIN,
  'user.revoke': RoleEnum.ADMIN,
  'user.sign': RoleEnum.ADMIN,
  'event.info': RoleEnum.ADMIN,
  'event.clear': RoleEnum.ADMIN,
  'event.clip': 'authorized',
}
