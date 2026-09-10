import type { DeliveryEvent } from '@spotter/transport'
import { eq } from 'drizzle-orm'
import type { TransportContext } from '../../context'
import { notifiedEventsRepo } from '../../db/repository'
import { notifiedEvents } from '../../db/schema'
import { renderEmail } from '../view/renderEmail'

/**
 * Only `create` sends: email cannot edit in place, so one event is one letter.
 * `claim` is atomic and rolled back on SMTP failure, so the entry is retried.
 */
export const sendEmailAction = async (
  delivery: DeliveryEvent,
  context: TransportContext,
): Promise<void> => {
  const { logger, db, s3, mailer, config } = context
  const { eventId, event, action, snapshotKey } = delivery

  // First notification only. Later updates/media don't warrant a new email.
  if (action !== 'create') {
    logger.debug(`skip email for ${eventId} (action ${action})`)
    return
  }

  // Atomic claim: if false, a previous delivery already emailed this event.
  if (!notifiedEventsRepo.claim(db, eventId)) {
    logger.debug(`skip email for ${eventId} (already notified)`)
    return
  }

  try {
    const snapshotUrl = snapshotKey
      ? s3.presign(snapshotKey, { expiresIn: config.presignExpiry })
      : undefined
    const eventUrl = config.publicUrl
      ? `${config.publicUrl.replace(/\/$/, '')}/event/${eventId}`
      : undefined

    const { subject, text, html } = renderEmail(event, context, {
      snapshotUrl,
      eventUrl,
    })

    await mailer.send({ to: config.recipients, subject, text, html })
    logger.debug(
      `email sent for ${eventId} to ${config.recipients.length} rcpt`,
    )
  } catch (error) {
    // Roll back the claim so the pending entry is retried on the next reclaim.
    db.delete(notifiedEvents).where(eq(notifiedEvents.eventId, eventId)).run()
    throw error
  }
}
