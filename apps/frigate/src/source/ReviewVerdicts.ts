import type { EventSeverity } from '@spotter/transport'

/** How long a verdict is worth remembering. */
const VERDICT_TTL_MS = 5 * 60_000

/**
 * Events and reviews are unordered, so a verdict is applied in either
 * direction. See docs/foundings/frigate-api-quirks.md.
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
