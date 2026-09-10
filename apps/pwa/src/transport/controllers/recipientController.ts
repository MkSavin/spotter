import {
  parsedController,
  safeParseDeliveryRecipient,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { devicesRepo } from '../../db/repository'

/**
 * A demoted user would otherwise keep the UI of their old role until they
 * re-authorize, offering buttons that always fail.
 */
export const recipientController = parsedController(
  safeParseDeliveryRecipient,
  async (update, context: TransportContext) => {
    if (update.action === 'revoke' || !update.role) {
      devicesRepo.revoke(context.db, update.recipientUuid)
      context.logger.debug(`revoked devices of ${update.recipientUuid}`)
      return
    }

    devicesRepo.setRole(context.db, update.recipientUuid, update.role)
  },
)
