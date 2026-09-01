import type { Stenograph } from 'stenograph'

/** How often retention runs. Retention is measured in days, so hourly is ample. */
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000

/**
 * How long a dedup ledger row is kept. Reclaim bounds a redelivery to minutes,
 * so a week is generous; the rows carry no other meaning.
 */
export const DEDUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export type RetentionOptions = {
  /** What is being trimmed, for the log line. */
  label: string
  /** Rows older than this are dropped. */
  retentionMs: number
  /** Deletes rows older than `cutoff`; returns how many went. */
  prune: (cutoff: Date) => number
  logger: Stenograph
  intervalMs?: number
}

/**
 * Periodically drops rows past their retention window.
 *
 * Every service keeps a table that only ever grows — the domain's event log,
 * the frontends' dedup ledgers — and none of them are read once they age out.
 * Left alone they inflate the SQLite file that shares a disk with the NVR's
 * recordings, so each owner schedules its own trim through this helper.
 */
export const startRetention = ({
  label,
  retentionMs,
  prune,
  logger,
  intervalMs = RETENTION_INTERVAL_MS,
}: RetentionOptions): (() => void) => {
  const sweep = (): void => {
    try {
      const removed = prune(new Date(Date.now() - retentionMs))
      if (removed > 0) logger.debug(`Pruned ${removed} ${label} row(s)`)
    } catch (error) {
      // A failed sweep must not take the service down: the rows are stale, not
      // load-bearing, and the next tick will try again.
      logger.warn(`Retention sweep for ${label} failed: ${error}`)
    }
  }

  // On start too: a service that restarts often would otherwise never sweep.
  sweep()
  const timer = setInterval(sweep, intervalMs)
  timer.unref?.()

  return () => clearInterval(timer)
}
