import {
  bufferToJson,
  type StreamMessageController,
  safeParseDeliveryRecipient,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { devicesRepo } from '../../db/repository'

/**
 * Keeps a device's cached role in step with the domain.
 *
 * Without this a demoted user keeps the UI of their old role until they
 * re-authorize — the server would refuse the commands, but offering buttons
 * that always fail is its own kind of broken. A revoked recipient loses its
 * devices outright.
 */
export const recipientController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const update = safeParseDeliveryRecipient(value)
  if (!update) return

  if (update.action === 'revoke' || !update.role) {
    devicesRepo.revoke(context.db, update.recipientUuid)
    context.logger.debug(`revoked devices of ${update.recipientUuid}`)
    return
  }

  devicesRepo.setRole(context.db, update.recipientUuid, update.role)
}
