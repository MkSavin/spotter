import { randomBytes } from 'node:crypto'
import { trySendCommand } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { devicesRepo } from '../../db/repository'
import { json, parseBody } from '../http'
import { authBody } from '../schemas'

/**
 * Redeems an access code and authorizes this install.
 *
 * The code is checked by the domain, not here: `device.redeem` draws on the
 * same pool `/user_sign` mints for the bot, so access is granted once rather
 * than once per frontend, and the role that comes back is the real one the
 * server will enforce on every later command.
 */
export const authHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const trace = context.logger.sub('auth')

  const parsed = await parseBody(request, authBody)
  if (!parsed.ok) {
    // A malformed body is the client's fault, but silently 400-ing it leaves
    // nothing to debug when the shape is subtly wrong (a short deviceId, say).
    trace.warn('Rejected malformed auth body')
    return parsed.response
  }

  const { deviceId, code, label } = parsed.data
  if (context.config.debug)
    trace.info(`Redeem attempt from ${deviceId} (${label ?? 'no label'})`)

  const outcome = await trySendCommand(context.commandBus, 'device.redeem', {
    code,
    deviceId,
  })

  if (!outcome.reached) {
    trace.warn('device.redeem did not answer', outcome.error)
    return json({ ok: false, error: 'unavailable' }, { status: 503 })
  }

  const { reply } = outcome

  if (!reply.ok) {
    trace.warn(`Redeem refused for ${deviceId}: ${reply.error ?? 'not-found'}`)
    // Pass the domain's reason through: "bound to a Telegram account" and
    // "expired" are different problems with different fixes, and collapsing
    // them into one message leaves the user guessing which they hit.
    return json(
      { ok: false, error: reply.error ?? 'not-found' },
      { status: 401 },
    )
  }

  const { recipientUuid, role } = reply.data as {
    recipientUuid: string
    role: string
  }

  // Stored as-is rather than hashed: unlike a password it is high-entropy and
  // single-purpose, and revoking means deleting the row either way.
  const token = randomBytes(32).toString('hex')

  devicesRepo.authorize(context.db, {
    deviceId,
    token,
    recipientUuid,
    role,
    label,
  })

  trace.info(`Device ${deviceId} authorized as ${role}`)
  return json({ ok: true, token, role })
}
