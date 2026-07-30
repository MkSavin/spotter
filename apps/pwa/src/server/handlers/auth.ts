import { randomUUID } from 'node:crypto'
import type { CoreContext } from '../../context'
import { subscriptionsRepo } from '../../db/repository'
import { json, notFound, parseBody } from '../http'
import { authBody } from '../schemas'

/**
 * Binds a device to a recipient after it presents a valid one-time code.
 * v1 validates the code locally against `PWA_ACCESS_CODES`; an empty list
 * means the gate is off and every subscribed device is authorized on subscribe.
 * Wiring this to the server's `access_tokens` over RPC is a later step.
 */
export const authHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const parsed = await parseBody(request, authBody)
  if (!parsed.ok) return parsed.response

  const { endpoint, code } = parsed.data

  if (!context.config.accessCodes.includes(code)) {
    return json({ ok: false, error: 'invalid code' }, { status: 401 })
  }

  const subscription = subscriptionsRepo.findByEndpoint(context.db, endpoint)
  if (!subscription) return notFound('subscription not found')

  subscriptionsRepo.bindRecipient(context.db, endpoint, randomUUID())
  return json({ ok: true, authorized: true })
}
