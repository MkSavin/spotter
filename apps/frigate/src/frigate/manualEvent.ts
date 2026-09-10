import type { Stenograph } from 'stenograph'
import type { FrigateMediaConfig } from '../config'
import { frigateFetch, frigateUrls, settleUrl } from './frigateClient'

// Real footage, so the media pipeline is exercised for real.
// See docs/foundings/frigate-api-quirks.md.

export type ManualEventOptions = {
  camera: string
  label: string
  /** Seconds of footage. Frigate ends the event itself once it elapses. */
  duration: number
}

/** Returns the real Frigate event id, or undefined when creation failed. */
export const createManualEvent = async (
  config: FrigateMediaConfig,
  { camera, label, duration }: ManualEventOptions,
  logger: Stenograph,
): Promise<string | undefined> => {
  try {
    const response = await frigateFetch(
      config,
      settleUrl(frigateUrls.createEvent, config.remoteUrl, { camera, label }),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, include_recording: true, score: 1 }),
        signal: AbortSignal.timeout(15_000),
      },
    )

    const body = (await response.json().catch(() => null)) as {
      success?: boolean
      event_id?: string
      message?: string
    } | null

    if (!response.ok || !body?.success || !body.event_id) {
      logger.warn(
        `Frigate refused to create a manual event: ${body?.message ?? response.status}`,
      )
      return undefined
    }

    return body.event_id
  } catch (error) {
    logger.warn('Failed to create a manual Frigate event', error)
    return undefined
  }
}

/** Ends a manual event early. Harmless if Frigate already closed it. */
export const endManualEvent = async (
  config: FrigateMediaConfig,
  eventId: string,
  logger: Stenograph,
): Promise<void> => {
  try {
    await frigateFetch(
      config,
      settleUrl(frigateUrls.endEvent, config.remoteUrl, { id: eventId }),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15_000),
      },
    )
  } catch (error) {
    logger.debug(
      'Failed to end the manual event (it may have ended already)',
      error,
    )
  }
}
