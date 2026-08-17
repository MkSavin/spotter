import { HEARTBEAT_STALE_MS, type Heartbeat } from '@spotter/transport'
import type { Stenograph } from 'stenograph'

export type ServiceStatus = Heartbeat & { online: boolean }

/** Latest heartbeat per service. Silence goes stale, not missing, so `/status` shows it. */
export class HeartbeatRegistry {
  private readonly latest = new Map<string, Heartbeat>()

  constructor(private readonly logger: Stenograph) {}

  apply(beat: Heartbeat): void {
    const key = `${beat.node}/${beat.service}`
    const previous = this.latest.get(key)
    this.latest.set(key, beat)

    // Every 30s per service is noise; only a new or changed service is news.
    if (!previous) this.logger.debug(`${key} appeared, v${beat.version}`)
    else if (previous.version !== beat.version)
      this.logger.info(`${key} ${previous.version} → ${beat.version}`)
  }

  /** Sorted by node, then service, so the report reads the same every time. */
  all(): ServiceStatus[] {
    const now = Date.now()
    return [...this.latest.values()]
      .map((beat) => ({ ...beat, online: now - beat.at < HEARTBEAT_STALE_MS }))
      .sort(
        (left, right) =>
          left.node.localeCompare(right.node) ||
          left.service.localeCompare(right.service),
      )
  }

  get size(): number {
    return this.latest.size
  }
}
