import { randomBytes } from 'node:crypto'
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
  const parsed = await parseBody(request, authBody)
  if (!parsed.ok) return parsed.response

  const { deviceId, code, label } = parsed.data

  let reply: Awaited<ReturnType<typeof context.commandBus.send>>

  try {
    reply = await context.commandBus.send('device.redeem', { code, deviceId })
  } catch (error) {
    context.logger.warn('device.redeem did not answer', error)
    return json({ ok: false, error: 'unavailable' }, { status: 503 })
  }

  if (!reply.ok) {
    return json({ ok: false, error: 'invalid code' }, { status: 401 })
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

  return json({ ok: true, token, role })
}
