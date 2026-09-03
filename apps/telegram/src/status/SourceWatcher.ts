import {
  HEARTBEAT_STALE_MS,
  type Heartbeat,
  isSourceSilent,
  isSourceUnreachable,
  type SourceActivity,
} from '@spotter/transport'
import type { Stenograph } from 'stenograph'

export type SourceFault = 'unreachable' | 'silent'

export type SourceAlert = {
  source: string
  node: string
  fault: SourceFault
  /** Set when the fault has cleared rather than begun. */
  recovered?: boolean
  /** How long the NVR has been in this state, seconds. */
  forSeconds: number
}

/** How often to re-check the sources we know about. */
export const SOURCE_CHECK_MS = 60_000

type Options = {
  checkMs?: number
  onAlert: (alert: SourceAlert) => unknown
}

/**
 * Turns adapter heartbeats into alerts about the NVR behind them.
 *
 * On a timer rather than on arrival, and that is the point: the failure this
 * exists for is an NVR that stops publishing while the adapter keeps beating
 * happily. Waiting for a message that says "I am broken" is exactly how two
 * days of silence went unnoticed — nobody sends that message.
 *
 * Transitions only. A fault that reported itself every minute would be muted
 * within a day, and then the next one would go unseen too.
 */
export class SourceWatcher {
  private readonly latest = new Map<
    string,
    { beat: Heartbeat; activity: SourceActivity }
  >()
  private readonly announced = new Map<string, SourceFault>()
  private readonly since = new Map<string, number>()
  private timer?: ReturnType<typeof setInterval>

  constructor(
    private readonly logger: Stenograph,
    private readonly options: Options,
  ) {}

  apply(beat: Heartbeat): void {
    if (!beat.source) return
    this.latest.set(`${beat.node}/${beat.source.source}`, {
      beat,
      activity: beat.source,
    })
  }

  /** Which fault this source is in, if any. Unreachable outranks silent. */
  private faultOf(activity: SourceActivity, now: number): SourceFault | null {
    if (isSourceUnreachable(activity, now)) return 'unreachable'

    // Event silence only means something when we cannot see the NVR another
    // way. An NVR that is demonstrably alive and simply has nothing to report
    // is a quiet night, and calling that an outage every winter morning is how
    // an alert gets muted for good.
    if (activity.reportsContact) return null

    if (isSourceSilent(activity, now)) return 'silent'
    return null
  }

  check(now = Date.now()): void {
    for (const [key, { beat, activity }] of this.latest) {
      // A dead adapter stops beating, and its last report freezes in place —
      // which would age into "the NVR is unreachable" and send the reader
      // looking at the wrong machine. Silence from the adapter is a different
      // fault, and `HEARTBEAT_STALE_MS` already covers it.
      if (now - beat.at > HEARTBEAT_STALE_MS) continue

      const fault = this.faultOf(activity, now)
      const announced = this.announced.get(key)

      if (fault === (announced ?? null)) continue

      if (!fault) {
        // Reached only with something announced: the healthy-and-quiet case is
        // the equality above, or we would report recovering from an illness
        // that never happened.
        if (!announced) continue

        this.announced.delete(key)
        const began = this.since.get(key) ?? now
        this.since.delete(key)
        this.logger.info(`${key} recovered`)
        this.options.onAlert({
          source: activity.source,
          node: beat.node,
          // Report what it recovered *from*, which is what the reader was told.
          fault: announced,
          recovered: true,
          forSeconds: Math.round((now - began) / 1000),
        })
        continue
      }

      // A source escalating from silent to unreachable keeps its start time:
      // the outage did not begin again, it got worse.
      const began = this.since.get(key) ?? now
      this.since.set(key, began)
      this.announced.set(key, fault)

      this.logger.warn(`${key} is ${fault}`)
      this.options.onAlert({
        source: activity.source,
        node: beat.node,
        fault,
        forSeconds: Math.round((now - began) / 1000),
      })
    }
  }

  start(): void {
    this.timer = setInterval(
      () => this.check(),
      this.options.checkMs ?? SOURCE_CHECK_MS,
    )
    this.timer.unref?.()
  }

  stop(): void {
    clearInterval(this.timer)
  }
}
