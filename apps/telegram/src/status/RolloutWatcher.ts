import type { Heartbeat } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { TelegramDatabase } from '../db/client'
import { serviceVersionsRepo } from '../db/repository'

export type RolloutChange = {
  node: string
  service: string
  from: string
  to: string
}

/** Waits this long after the last change, so one rollout sends one message. */
export const ROLLOUT_DEBOUNCE_MS = 90_000

type Options = {
  debounceMs?: number
  onRollout: (changes: RolloutChange[]) => unknown
}

/**
 * Turns heartbeats into rollout notices. Versions live in SQLite, so a service
 * that changed while the bot was down is still reported on the next heartbeat,
 * and a bot restart alone reports nothing.
 */
export class RolloutWatcher {
  private readonly pending = new Map<string, RolloutChange>()
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly db: TelegramDatabase,
    private readonly logger: Stenograph,
    private readonly options: Options,
  ) {}

  apply(beat: Heartbeat): void {
    const previous = serviceVersionsRepo.record(
      this.db,
      beat.node,
      beat.service,
      beat.version,
    )

    // Unchanged, or a service seen for the very first time: a fresh install
    // would otherwise announce every service as an update.
    if (previous === undefined || previous === beat.version) return

    this.logger.info(
      `${beat.node}/${beat.service} ${previous} → ${beat.version}`,
    )

    const key = `${beat.node}/${beat.service}`
    // Keep the original `from`: services in one rollout arrive seconds apart.
    this.pending.set(key, {
      node: beat.node,
      service: beat.service,
      from: this.pending.get(key)?.from ?? previous,
      to: beat.version,
    })

    this.schedule()
  }

  private schedule(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.flush()
    }, this.options.debounceMs ?? ROLLOUT_DEBOUNCE_MS)
    // Never hold the process open on its own.
    this.timer.unref?.()
  }

  private flush(): void {
    const changes = [...this.pending.values()].sort(
      (left, right) =>
        left.node.localeCompare(right.node) ||
        left.service.localeCompare(right.service),
    )
    this.pending.clear()
    if (!changes.length) return

    Promise.resolve(this.options.onRollout(changes)).catch((error) =>
      this.logger.error(`Rollout notice failed: ${error}`),
    )
  }

  stop(): void {
    clearTimeout(this.timer)
  }
}
