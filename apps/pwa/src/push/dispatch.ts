import type { PwaDatabase } from '../db/client'
import { subscriptionsRepo } from '../db/repository'
import type { PushGateway } from '../push/PushGateway'
import type { NotificationPayload } from '../render/notification'

export type DispatchResult = { sent: number; pruned: number }

export type DispatchDeps = { db: PwaDatabase; push: PushGateway }

/**
 * Fans a notification out to every stored subscription, pruning endpoints the
 * push service reports as gone (404/410). The event code becomes the coalescing
 * `topic` so a burst replaces rather than stacks on the device.
 */
export const dispatchNotification = async (
  { db, push }: DispatchDeps,
  payload: NotificationPayload,
  topic: string,
): Promise<DispatchResult> => {
  const targets = subscriptionsRepo.list(db)

  const results = await Promise.all(
    targets.map((target) => push.send(target, payload, { topic })),
  )

  let sent = 0
  let pruned = 0
  results.forEach((result, index) => {
    if (result.ok) {
      sent += 1
    } else if (result.gone) {
      subscriptionsRepo.remove(db, targets[index].endpoint)
      pruned += 1
    }
  })

  return { sent, pruned }
}
