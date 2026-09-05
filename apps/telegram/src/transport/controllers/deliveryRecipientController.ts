import {
  parsedController,
  safeParseDeliveryRecipient,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { tgBindingsRepo, tgChatsRepo } from '../../db/repository'
import type { Role } from '../../db/schema'

export const deliveryRecipientController = parsedController(
  safeParseDeliveryRecipient,
  async (delivery, context: TransportContext) => {
    const { logger, db } = context
    const { recipientUuid, role, action } = delivery

    if (action === 'revoke') {
      const removed = tgBindingsRepo.removeByRecipientUuid(db, recipientUuid)
      for (const binding of removed) {
        tgChatsRepo.remove(db, binding.tgChatId)
      }
      logger.debug(
        `Revoked recipient ${recipientUuid} (${removed.length} bindings removed)`,
      )
      return
    }

    if (role) {
      const updated = tgBindingsRepo.setRole(db, recipientUuid, role as Role)
      logger.debug(
        `Role updated for recipient ${recipientUuid} → ${role} (${updated} bindings)`,
      )
    }
  },
)
