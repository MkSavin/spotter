import type { Stenograph } from 'stenograph'
import webpush, { type PushSubscription } from 'web-push'
import type { VapidConfig } from '../config'

export type PushTarget = {
  endpoint: string
  p256dh: string
  auth: string
}

export type PushOptions = {
  /**
   * Server-side coalescing key (≤32 chars): the push service replaces an
   * undelivered notification carrying the same topic instead of queuing a new
   * one. Use the event code so a burst of updates collapses to one alert.
   */
  topic?: string
  /** Seconds the push service holds the message if the device is offline. */
  ttl?: number
}

/** `true` = subscription is gone (404/410) and its row should be deleted. */
export type SendResult = { ok: true } | { ok: false; gone: boolean }

const GONE_STATUS = new Set([404, 410])

/**
 * Thin wrapper over `web-push`: VAPID is configured once at construction, and
 * `send` maps a stored subscription row to an encrypted push, surfacing dead
 * endpoints so the caller can prune them.
 */
export class PushGateway {
  constructor(
    config: VapidConfig,
    private readonly logger: Stenograph,
  ) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  }

  async send(
    target: PushTarget,
    payload: unknown,
    options: PushOptions = {},
  ): Promise<SendResult> {
    const subscription: PushSubscription = {
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth },
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: options.ttl ?? 60,
        urgency: 'high',
        topic: options.topic,
      })
      return { ok: true }
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      const gone = status !== undefined && GONE_STATUS.has(status)
      if (!gone)
        this.logger.warn(`push failed (${status ?? 'no status'})`, error)
      return { ok: false, gone }
    }
  }
}
