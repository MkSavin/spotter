import type { Stenograph } from 'stenograph'
import type { ClipStage } from '../transport/view/eventKeyboard'

/** Give up on a clip after this long and let the user try again. */
export const CLIP_TIMEOUT_MS = 5 * 60_000

export type ClipOutcome =
  | { stage: ClipStage; percent?: number }
  | { failed: string }

type Options = {
  timeoutMs?: number
  /** Repaints the event's messages; `undefined` reason means still working. */
  render: (eventId: string, outcome: ClipOutcome) => unknown
}

/** Tracks awaited clips; a timeout ends the wait with a retry button. */
export class ClipTracker {
  private readonly waiting = new Map<
    string,
    {
      stage: ClipStage
      percent?: number
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(
    private readonly logger: Stenograph,
    private readonly options: Options,
  ) {}

  /** The user tapped the button: start waiting. */
  begin(eventId: string): void {
    this.arm(eventId, 'requested')
  }

  /** A stage update arrived from the pipeline. */
  advance(eventId: string, stage: ClipStage, percent?: number): void {
    // Media moves for events nobody asked about; those must not paint a button.
    const current = this.waiting.get(eventId)
    if (!current) return
    // Repeated percentages would spend an API call painting the same button.
    if (current.stage === stage && current.percent === percent) return
    this.arm(eventId, stage, percent)
    void this.options.render(eventId, { stage, percent })
  }

  /** The pipeline gave up; tell the user why. */
  fail(eventId: string, reason: string): void {
    if (!this.finish(eventId)) return
    void this.options.render(eventId, { failed: reason })
  }

  /** The clip arrived: stop tracking, the media edit repaints the message. */
  complete(eventId: string): void {
    this.finish(eventId)
  }

  private arm(eventId: string, stage: ClipStage, percent?: number): void {
    clearTimeout(this.waiting.get(eventId)?.timer)
    // Each stage restarts the clock: progress means it is still alive.
    const timer = setTimeout(() => {
      this.logger.warn(`Clip for ${eventId} timed out at stage "${stage}"`)
      this.fail(eventId, 'Видео готовилось слишком долго')
    }, this.options.timeoutMs ?? CLIP_TIMEOUT_MS)
    timer.unref?.()
    this.waiting.set(eventId, { stage, percent, timer })
  }

  /** Drops the wait; returns false when there was nothing to drop. */
  private finish(eventId: string): boolean {
    const entry = this.waiting.get(eventId)
    if (!entry) return false
    clearTimeout(entry.timer)
    this.waiting.delete(eventId)
    return true
  }

  get size(): number {
    return this.waiting.size
  }

  stop(): void {
    for (const entry of this.waiting.values()) clearTimeout(entry.timer)
    this.waiting.clear()
  }
}
