import type { CoreContext } from '../../context'
import { authorize } from '../auth'
import { json, parseBody } from '../http'
import { revokeBody, setRoleBody, signBody } from '../schemas'

/**
 * User management is the domain's business: every route here forwards to a
 * command and returns what the server says. The admin check below is a
 * convenience — the server enforces it again against the real recipient.
 */
const forward = async (
  context: CoreContext,
  kind: string,
  args: Record<string, unknown>,
  recipientUuid: string,
): Promise<Response> => {
  try {
    const reply = await context.commandBus.send(kind, args, recipientUuid)

    if (!reply.ok) {
      const status = reply.error === 'not-found' ? 404 : 400
      return json({ error: reply.error ?? 'rejected' }, { status })
    }

    return json({ ok: true, data: reply.data })
  } catch (error) {
    context.logger.warn(`${kind} did not answer`, error)
    return json({ error: 'unavailable' }, { status: 503 })
  }
}

export const usersHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const auth = authorize(request, context, 'ADMIN')
  if (!auth.ok) return auth.response

  return forward(context, 'user.list', {}, auth.device.recipientUuid)
}

export const setRoleHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const auth = authorize(request, context, 'ADMIN')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, setRoleBody)
  if (!parsed.ok) return parsed.response

  return forward(
    context,
    'user.setRole',
    { ...parsed.data },
    auth.device.recipientUuid,
  )
}

export const revokeHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const auth = authorize(request, context, 'ADMIN')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, revokeBody)
  if (!parsed.ok) return parsed.response

  // Revoking yourself would lock the last admin out of the domain.
  if (parsed.data.ref === auth.device.recipientUuid) {
    return json({ error: 'cannot revoke yourself' }, { status: 400 })
  }

  return forward(
    context,
    'user.revoke',
    { ...parsed.data },
    auth.device.recipientUuid,
  )
}

export const signHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const auth = authorize(request, context, 'ADMIN')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, signBody)
  if (!parsed.ok) return parsed.response

  return forward(
    context,
    'user.sign',
    { ...parsed.data },
    auth.device.recipientUuid,
  )
}
