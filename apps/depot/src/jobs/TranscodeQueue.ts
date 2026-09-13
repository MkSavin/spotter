import type { JobStore } from '@spotter/sink'
import { type MediaStaged, mediaStreams } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import { mediaStagedAction } from '../actions/mediaStagedAction'
import type { CoreContext } from '../context'

/** A transcode accepted from the stream and still owed a result. */
export type TranscodeJobRecord = {
  jobId: string
  staged: MediaStaged
  startedAt: number
}

export type TranscodeQueueOptions = {
  context: CoreContext
  store?: JobStore<TranscodeJobRecord>
  /** How many clips may be encoded at once. */
  concurrency?: number
}

/**
 * Runs transcodes outside the Redis entry that asked for them, so a clip that
 * takes an hour no longer has to finish inside the reclaim window.
 */
export class TranscodeQueue {
  private readonly pending: TranscodeJobRecord[] = []
  private readonly running = new Set<string>()
  private readonly concurrency: number
  private stopped = false
  private idle: (() => void) | undefined

  constructor(private readonly options: TranscodeQueueOptions) {
    this.concurrency = options.concurrency ?? 1
  }

  /** Records the job, then returns: the caller acks its stream entry at once. */
  async accept(staged: MediaStaged, logger: Stenograph): Promise<void> {
    if (this.running.has(staged.eventId)) {
      logger.debug(`Transcode of ${staged.eventId} is already running`)
      return
    }

    const record: TranscodeJobRecord = {
      jobId: staged.eventId,
      staged,
      startedAt: Date.now(),
    }

    await this.remember(record, logger)
    this.pending.push(record)
    this.pump(logger)
  }

  /** Re-queues jobs a previous process accepted but never finished. */
  async recover(logger: Stenograph): Promise<number> {
    const records = (await this.options.store?.list()) ?? []

    for (const record of records) {
      if (this.running.has(record.jobId)) continue
      logger.info(`Resuming transcode of ${record.jobId}`)
      this.pending.push(record)
    }

    this.pump(logger)
    return records.length
  }

  /** Stops taking new work and waits for what is already encoding. */
  async stop(): Promise<void> {
    this.stopped = true
    this.pending.length = 0
    if (this.running.size === 0) return
    await new Promise<void>((resolve) => {
      this.idle = resolve
    })
  }

  get depth(): number {
    return this.pending.length + this.running.size
  }

  private pump(logger: Stenograph): void {
    while (
      !this.stopped &&
      this.running.size < this.concurrency &&
      this.pending.length > 0
    ) {
      const record = this.pending.shift()
      if (record) void this.run(record, logger)
    }
  }

  private async run(
    record: TranscodeJobRecord,
    logger: Stenograph,
  ): Promise<void> {
    const { producer } = this.options.context
    const jobLogger = logger.sub('transcode', record.jobId)
    this.running.add(record.jobId)

    try {
      const result = await mediaStagedAction(record.staged, {
        ...this.options.context,
        logger: jobLogger,
      })

      if (result) {
        await producer.publish(mediaStreams.mediaProcessed, result)
        jobLogger.info('Transcode finished')
      } else {
        await this.report(record, 'Не удалось перекодировать видео')
      }

      await this.forget(record.jobId, jobLogger)
    } catch (error) {
      // Left in the store on purpose: no stream entry will redeliver this now,
      // so the next start is what retries it.
      jobLogger.error(error)
      await this.report(
        record,
        'Видео ещё не готово — попробуй через полминуты',
      )
    } finally {
      this.running.delete(record.jobId)
      if (!this.stopped) this.pump(logger)
      if (this.running.size === 0) this.idle?.()
    }
  }

  private async report(
    record: TranscodeJobRecord,
    reason: string,
  ): Promise<void> {
    const { producer } = this.options.context
    await producer
      .publish(mediaStreams.mediaProgress, {
        eventId: record.staged.eventId,
        stage: 'failed',
        reason,
      })
      .catch(() => undefined)
    await producer
      .publish(mediaStreams.mediaProcessed, { eventId: record.staged.eventId })
      .catch(() => undefined)
  }

  private async remember(
    record: TranscodeJobRecord,
    logger: Stenograph,
  ): Promise<void> {
    try {
      await this.options.store?.put(record)
    } catch (error) {
      logger.warn('Could not record the transcode job', error)
    }
  }

  private async forget(jobId: string, logger: Stenograph): Promise<void> {
    try {
      await this.options.store?.drop(jobId)
    } catch (error) {
      logger.warn('Could not drop the transcode job', error)
    }
  }
}
