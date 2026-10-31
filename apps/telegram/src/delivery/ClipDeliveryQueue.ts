import type { DeliveryEvent, JobStore } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { TransportContext } from '../context'
import { deliveryEventAction } from '../transport/actions/deliveryEventAction'

/** A clip delivery accepted from the stream and still owed to the chats. */
export type ClipDeliveryRecord = {
  jobId: string
  delivery: DeliveryEvent
  acceptedAt: number
  /** Failed runs so far; the record is dropped once they reach the cap. */
  attempts: number
}

export type ClipDeliveryRunner = (
  delivery: DeliveryEvent,
  context: TransportContext,
) => Promise<void>

export type ClipDeliveryQueueOptions = {
  store?: JobStore<ClipDeliveryRecord>
  run?: ClipDeliveryRunner
  /** How many runs a delivery gets before it is given up on. */
  attempts?: number
  /** Pause before a rerun; doubles each time. */
  backoffMs?: number
}

/**
 * Delivers clips that have to travel as bytes outside the Redis entry that
 * announced them: a clip of hundreds of megabytes over a flaky link takes
 * longer than the reclaim window, and a reaper redelivery mid-upload would
 * send it twice. The entry is acked the moment the job is recorded; the
 * record, not the stream, is what survives a restart.
 */
export class ClipDeliveryQueue {
  private readonly pending: {
    record: ClipDeliveryRecord
    context: TransportContext
  }[] = []
  /** Event ids accepted and not yet finished, so a redelivery is a no-op. */
  private readonly claimed = new Set<string>()
  private running = false
  private stopped = false
  private idle: (() => void) | undefined
  private readonly run: ClipDeliveryRunner
  private readonly attempts: number
  private readonly backoffMs: number

  constructor(
    private readonly logger: Stenograph,
    private readonly options: ClipDeliveryQueueOptions = {},
  ) {
    this.run = options.run ?? deliveryEventAction
    this.attempts = options.attempts ?? 3
    this.backoffMs = options.backoffMs ?? 30_000
  }

  /** Records the delivery, then returns: the caller acks its entry at once. */
  async accept(
    delivery: DeliveryEvent,
    context: TransportContext,
  ): Promise<void> {
    // Claimed before the first await: a redelivery arriving mid-`put` would
    // otherwise pass the check and queue the same clip twice.
    if (!this.claim(delivery.eventId)) {
      this.logger.debug(
        `Clip delivery of ${delivery.eventId} is already queued`,
      )
      return
    }
    const record: ClipDeliveryRecord = {
      jobId: delivery.eventId,
      delivery,
      acceptedAt: Date.now(),
      attempts: 0,
    }
    await this.remember(record)
    this.enqueue(record, context)
  }

  /** Re-queues deliveries a previous process accepted but never finished. */
  async recover(context: TransportContext): Promise<number> {
    const records = (await this.options.store?.list()) ?? []
    let resumed = 0
    for (const record of records) {
      if (!this.claim(record.jobId)) continue
      this.logger.info(`Resuming clip delivery of ${record.jobId}`)
      this.enqueue(record, context)
      resumed += 1
    }
    return resumed
  }

  /** Stops taking new work and waits for the delivery in flight. */
  async stop(): Promise<void> {
    this.stopped = true
    for (const { record } of this.pending) this.claimed.delete(record.jobId)
    this.pending.length = 0
    if (!this.running) return
    await new Promise<void>((resolve) => {
      this.idle = resolve
    })
  }

  get depth(): number {
    return this.pending.length + (this.running ? 1 : 0)
  }

  private claim(eventId: string): boolean {
    if (this.claimed.has(eventId)) return false
    this.claimed.add(eventId)
    return true
  }

  private enqueue(record: ClipDeliveryRecord, context: TransportContext): void {
    this.pending.push({ record, context })
    this.pump()
  }

  /** One at a time: the link to the storage is the bottleneck, not the bot. */
  private pump(): void {
    if (this.stopped || this.running) return
    const next = this.pending.shift()
    if (!next) return
    this.running = true
    void this.execute(next.record, next.context).finally(() => {
      this.running = false
      if (this.stopped) this.idle?.()
      else this.pump()
    })
  }

  private async execute(
    record: ClipDeliveryRecord,
    context: TransportContext,
  ): Promise<void> {
    const logger = this.logger.sub(record.jobId)
    try {
      await this.run(record.delivery, { ...context, logger })
      await this.forget(record.jobId)
      this.claimed.delete(record.jobId)
    } catch (error) {
      record.attempts += 1
      if (record.attempts >= this.attempts) {
        // No stream entry will redeliver this: the retries were the queue's.
        logger.error(
          `Clip delivery given up after ${record.attempts} attempts`,
          error,
        )
        await this.forget(record.jobId)
        this.claimed.delete(record.jobId)
        return
      }
      logger.warn(`Clip delivery failed, attempt ${record.attempts}`, error)
      await this.remember(record)
      setTimeout(
        () => {
          if (!this.stopped) this.enqueue(record, context)
        },
        this.backoffMs * 2 ** (record.attempts - 1),
      )
    }
  }

  private async remember(record: ClipDeliveryRecord): Promise<void> {
    try {
      await this.options.store?.put(record)
    } catch (error) {
      this.logger.warn('Could not record the clip delivery', error)
    }
  }

  private async forget(jobId: string): Promise<void> {
    try {
      await this.options.store?.drop(jobId)
    } catch (error) {
      this.logger.warn('Could not drop the clip delivery', error)
    }
  }
}
