import type { EventMoment, MediaFetch, MediaProvider } from '@spotter/sink'
import type { FrigateMediaConfig } from '../config'
import {
  frigateFetch,
  frigateMediaRequest,
  frigateUrls,
  settleUrl,
} from '../frigate/frigateClient'

type FrigateEvent = {
  camera?: string
  start_time?: number
  end_time?: number
}

/**
 * Frigate implementation of the sink `MediaProvider`. Knows Frigate's media URL
 * scheme and mints the JWT — the only component holding these credentials. The
 * runtime fetches the returned requests and stages the bytes into S3.
 */
export class FrigateMediaProvider implements MediaProvider {
  constructor(private readonly config: FrigateMediaConfig) {}

  resolveClip(eventId: string): MediaFetch {
    return frigateMediaRequest(this.config, frigateUrls.clip, { id: eventId })
  }

  resolveSnapshot(eventId: string): MediaFetch {
    return frigateMediaRequest(this.config, frigateUrls.snapshot, {
      id: eventId,
    })
  }

  /**
   * `moment` is preferred over the API, which cannot answer this soon after
   * the end. See docs/foundings/frigate-event-media.md.
   */
  async resolveEventFrame(
    eventId: string,
    moment?: EventMoment,
  ): Promise<MediaFetch | null> {
    const known =
      moment ??
      (await this.fetchEvent(eventId).then((event) =>
        event?.camera && event.start_time !== undefined
          ? {
              camera: event.camera,
              startTime: event.start_time,
              endTime: event.end_time,
            }
          : null,
      ))

    if (!known) return null

    /**
     * Midpoint rather than the start: the object is more likely in frame once
     * it has moved into view.
     */
    const time = known.endTime
      ? (known.startTime + known.endTime) / 2
      : known.startTime

    return frigateMediaRequest(this.config, frigateUrls.recordingFrame, {
      camera: known.camera,
      time: time.toFixed(6),
    })
  }

  resolveFrame(camera: string): MediaFetch {
    return frigateMediaRequest(this.config, frigateUrls.latestFrame, { camera })
  }

  private async fetchEvent(eventId: string): Promise<FrigateEvent | null> {
    try {
      const response = await frigateFetch(
        this.config,
        settleUrl(frigateUrls.event, this.config.remoteUrl, { id: eventId }),
      )
      return response.ok ? ((await response.json()) as FrigateEvent) : null
    } catch {
      return null
    }
  }
}
