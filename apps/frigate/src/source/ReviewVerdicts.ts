import type { EventSeverity } from '@spotter/transport'

/** How long a verdict is worth remembering. */
const VERDICT_TTL_MS = 5 * 60_000

/**
 * Remembers the severity Frigate assigned to each tracked object.
 *
 * `frigate/events` and `frigate/reviews` are independent topics with no
 * ordering between them, and a review usually lands slightly *after* the
 * `new` event it covers. So both directions are handled: a verdict already
 * here stamps the event on its way out, and one that arrives later is applied
 * to the `update`/`end` that follows — which is soon enough, since the alert
 * that matters is dispatched on `end`.
 *
 * Bounded by a TTL rather than by count: entries are only interesting for as
 * long as their event is still moving through the pipeline.
 */
export class ReviewVerdicts {
  private readonly verdicts = new Map<
    string,
    { severity: EventSeverity; at: number }
  >()

  constructor(private readonly ttlMs: number = VERDICT_TTL_MS) {}

  record(eventIds: string[], severity: EventSeverity, now = Date.now()): void {
    for (const id of eventIds) this.verdicts.set(id, { severity, at: now })
    this.sweep(now)
  }

  /** The severity known for this event, if a review has mentioned it. */
  severityOf(eventId: string, now = Date.now()): EventSeverity | undefined {
    const entry = this.verdicts.get(eventId)
    if (!entry) return undefined
    if (now - entry.at > this.ttlMs) {
      this.verdicts.delete(eventId)
      return undefined
    }
    return entry.severity
  }

  private sweep(now: number): void {
    for (const [id, entry] of this.verdicts) {
      if (now - entry.at > this.ttlMs) this.verdicts.delete(id)
    }
  }

  get size(): number {
    return this.verdicts.size
  }
}
