import type { CoreContext } from '../../context'
import { subscriptionsRepo } from '../../db/repository'
import { badRequest, json, notFound, parseBody, requestQuery } from '../http'
import { subscribeBody, testPushBody, unsubscribeBody } from '../schemas'

/** Reads the stored status of a device by its `?endpoint=` query param. */
export const subscriptionStatusHandler = (
  request: Request,
  context: CoreContext,
): Response => {
  const endpoint = requestQuery(request.url).get('endpoint')
  if (!endpoint) return badRequest('endpoint is required')

  const row = subscriptionsRepo.findByEndpoint(context.db, endpoint)
  if (!row) return json({ subscribed: false })

  return json({
    subscribed: true,
    authorized: row.recipientUuid !== null,
    deviceLabel: row.deviceLabel,
  })
}

export const subscribeHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const parsed = await parseBody(request, subscribeBody)
  if (!parsed.ok) return parsed.response

  const { subscription, deviceLabel } = parsed.data
  const row = subscriptionsRepo.upsert(context.db, subscription, deviceLabel)

  return json({
    endpoint: row.endpoint,
    authorized: row.recipientUuid !== null,
    deviceLabel: row.deviceLabel,
  })
}

export const unsubscribeHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const parsed = await parseBody(request, unsubscribeBody)
  if (!parsed.ok) return parsed.response

  subscriptionsRepo.remove(context.db, parsed.data.endpoint)
  return json({ ok: true })
}

/** Sends a single notification to one endpoint so the user can verify delivery. */
export const testPushHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const parsed = await parseBody(request, testPushBody)
  if (!parsed.ok) return parsed.response

  const target = subscriptionsRepo.findByEndpoint(
    context.db,
    parsed.data.endpoint,
  )
  if (!target) return notFound('subscription not found')

  const result = await context.push.send(
    target,
    {
      title: 'Spotter',
      body: 'Тестовое уведомление — всё работает.',
      url: '/',
    },
    { topic: 'test' },
  )

  if (!result.ok && result.gone) {
    subscriptionsRepo.remove(context.db, target.endpoint)
    return notFound('subscription expired')
  }

  return json({ ok: result.ok })
}
