import { lt } from 'drizzle-orm'
import type { EmailDatabase } from './client'
import { notifiedEvents } from './schema'

export const notifiedEventsRepo = {
  /**
   * Atomically claims an event for emailing. Returns `true` if this is the
   * first time we see it (caller should send), `false` if already recorded
   * (a redelivery — caller must skip). `onConflictDoNothing` makes the check
   * and the insert a single race-free step.
   */
  claim: (db: EmailDatabase, eventId: string): boolean => {
    const inserted = db
      .insert(notifiedEvents)
      .values({ eventId })
      .onConflictDoNothing()
      .returning()
      .get()
    return inserted !== undefined
  },

  /**
   * Drops ledger rows past the dedup window. The ledger only has to outlive a
   * redelivery, which reclaim bounds to minutes — anything older is dead weight.
   */
  prune: (db: EmailDatabase, cutoff: Date): number =>
    db
      .delete(notifiedEvents)
      .where(lt(notifiedEvents.notifiedAt, cutoff))
      .returning({ eventId: notifiedEvents.eventId })
      .all().length,
}
