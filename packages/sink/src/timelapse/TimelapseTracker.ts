import {
  type StreamProducer,
  type TimelapseRequest,
  timelapseStreams,
} from '@spotter/transport'
import type { S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import { stageMedia } from '../media/stageMedia'
import type { TimelapseProvider } from './TimelapseProvider'

/** How often a running export is checked. */
export const POLL_INTERVAL_MS = 15_000

/**
 * How long an export may run before it is given up on. Generous: a full day of
 * recordings re-encodes for a long time on modest hardware.
 */
export const POLL_DEADLINE_MS = 3_600_000

/** Build the staging S3 key for an exported timelapse. */
export const stagedTimelapseKey = (
  prefix: string,
  source: string,
  jobId: string,
): string => `${prefix}/${source}/timelapse-${jobId}.mp4`

/** A started export, as remembered across restarts. */
export type TimelapseJobRecord = {
  jobId: string
  request: TimelapseRequest
  startedAt: number
}

/**
 * Where in-flight exports are remembered. An export outlives the request that
 * started it, so without this a restart would leave the NVR producing a file
 * nobody is waiting for and the user staring at a message that never updates.
 */
export interface TimelapseStore {
  put(record: TimelapseJobRecord): void | Promise<void>
  drop(jobId: string): void | Promise<void>
  list(): TimelapseJobRecord[] | Promise<TimelapseJobRecord[]>
}

export type TimelapseTrackerOptions = {
  provider: TimelapseProvider
  producer: StreamProducer
  s3: S3Client
  stagingPrefix: string
  sourceId: string
  logger: Stenograph
  store?: TimelapseStore
  pollIntervalMs?: number
  deadlineMs?: number
}

/**
 * Drives exports from "started" to "staged in S3".
 *
 * Polling lives here rather than in the stream controller so the request can be
 * acknowledged immediately; see `createTimelapseController`.
 */
export class TimelapseTracker {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pollIntervalMs: number
  private readonly deadlineMs: number
  private stopped = false

  constructor(private readonly options: TimelapseTrackerOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS
    this.deadlineMs = options.deadlineMs ?? POLL_DEADLINE_MS
  }

  /** Starts an export and begins watching it. */
  async start(request: TimelapseRequest, logger: Stenograph): Promise<void> {
    const job = await this.options.provider
      .startExport({
        camera: request.camera,
        start: request.start,
        end: request.end,
        speed: request.speed,
      })
      .catch((error) => {
        logger.error('Export could not be started', error)
        return null
      })

    if (!job) {
      await this.fail(request, 'rejected')
      return
    }

    const record: TimelapseJobRecord = {
      jobId: job.id,
      request,
      startedAt: Date.now(),
    }

    await this.remember(record, logger)

    logger.info(`Export ${job.id} started`)
    this.schedule(record, logger)
  }

  /**
   * Resumes exports left running by a previous process. Called at startup;
   * anything already past the deadline is reported as failed rather than
   * silently dropped.
   */
  async recover(logger: Stenograph): Promise<number> {
    const records = (await this.options.store?.list()) ?? []

    for (const record of records) {
      if (Date.now() - record.startedAt > this.deadlineMs) {
        logger.warn(`Export ${record.jobId} exceeded its deadline; giving up`)
        await this.forget(record.jobId, logger)
        await this.fail(record.request, 'timeout')
        continue
      }

      logger.info(`Resuming export ${record.jobId}`)
      this.schedule(record, logger)
    }

    return records.length
  }

  /** Stops watching; in-flight exports resume from the store on next start. */
  stop(): void {
    this.stopped = true
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private schedule(record: TimelapseJobRecord, logger: Stenograph): void {
    if (this.stopped || this.timers.has(record.jobId)) return

    const tick = async () => {
      this.timers.delete(record.jobId)
      if (this.stopped) return

      try {
        await this.poll(record, logger)
      } catch (error) {
        // Keep watching: a failed poll is usually the NVR restarting, and the
        // export itself is still running on its side.
        logger.warn(`Poll of ${record.jobId} failed`, error)
        this.rearm(record, logger, tick)
      }
    }

    this.rearm(record, logger, tick)
  }

  private rearm(
    record: TimelapseJobRecord,
    logger: Stenograph,
    tick: () => Promise<void>,
  ): void {
    if (this.stopped) return

    if (Date.now() - record.startedAt > this.deadlineMs) {
      logger.warn(`Export ${record.jobId} exceeded its deadline; giving up`)
      void this.forget(record.jobId, logger).then(() =>
        this.fail(record.request, 'timeout'),
      )
      return
    }

    const timer = setTimeout(tick, this.pollIntervalMs)
    // Never hold the process open just to poll an export.
    timer.unref?.()
    this.timers.set(record.jobId, timer)
  }

  private async poll(
    record: TimelapseJobRecord,
    logger: Stenograph,
  ): Promise<void> {
    const progress = await this.options.provider.pollExport(record.jobId)

    if (progress.state === 'running') {
      this.schedule(record, logger)
      return
    }

    if (progress.state === 'lost') {
      logger.warn(`Export ${record.jobId} vanished from the NVR`)
      await this.forget(record.jobId, logger)
      await this.fail(record.request, 'rejected')
      return
    }

    const key = stagedTimelapseKey(
      this.options.stagingPrefix,
      this.options.sourceId,
      record.jobId,
    )

    const result = await stageMedia(
      this.options.s3,
      key,
      progress.fetch,
      'video/mp4',
      logger,
    )

    if (!result.staged) {
      // `absent` is a verdict; anything else may succeed on the next tick.
      if (result.reason === 'unavailable') {
        this.schedule(record, logger)
        return
      }

      await this.forget(record.jobId, logger)
      await this.fail(record.request, 'rejected')
      return
    }

    await this.forget(record.jobId, logger)

    await this.options.producer.publish(timelapseStreams.ready, {
      source: this.options.sourceId,
      camera: record.request.camera,
      start: record.request.start,
      end: record.request.end,
      speed: record.request.speed,
      videoKey: key,
      chatId: record.request.chatId,
      messageId: record.request.messageId,
    })

    logger.info(`Export ${record.jobId} staged to s3://${key}`)

    // The bytes are ours now; leaving the copy would fill the NVR's disk.
    await this.options.provider
      .discardExport(record.jobId)
      .catch((error) => logger.warn('Could not discard export', error))
  }

  private async fail(
    request: TimelapseRequest,
    reason: 'empty' | 'rejected' | 'timeout',
  ): Promise<void> {
    await this.options.producer.publish(timelapseStreams.failed, {
      source: this.options.sourceId,
      camera: request.camera,
      reason,
      chatId: request.chatId,
      messageId: request.messageId,
    })
  }

  private async remember(
    record: TimelapseJobRecord,
    logger: Stenograph,
  ): Promise<void> {
    try {
      await this.options.store?.put(record)
    } catch (error) {
      // Not fatal: the export still runs, it just will not survive a restart.
      logger.warn(`Could not persist export ${record.jobId}`, error)
    }
  }

  private async forget(jobId: string, logger: Stenograph): Promise<void> {
    const timer = this.timers.get(jobId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(jobId)
    }

    try {
      await this.options.store?.drop(jobId)
    } catch (error) {
      logger.warn(`Could not forget export ${jobId}`, error)
    }
  }
}
