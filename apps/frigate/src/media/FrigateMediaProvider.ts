import type { MediaFetch, MediaProvider } from '@spotter/sink'
import type { FrigateMediaConfig } from '../config'
import {
  frigateAuthHeaders,
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
   * A still cut from the continuous recording. Frigate only writes an event
   * snapshot once tracking ends and picks a "best" frame, so a sub-second
   * event has none — but the recording still covers that moment.
   */
  async resolveEventFrame(eventId: string): Promise<MediaFetch | null> {
    const event = await this.fetchEvent(eventId)
    if (!event?.camera || event.start_time === undefined) return null

    // Midpoint rather than the start: the object is more likely in frame once
    // it has moved into view.
    const time = event.end_time
      ? (event.start_time + event.end_time) / 2
      : event.start_time

    return frigateMediaRequest(this.config, frigateUrls.recordingFrame, {
      camera: event.camera,
      time: time.toFixed(6),
    })
  }

  resolveFrame(camera: string): MediaFetch {
    return frigateMediaRequest(this.config, frigateUrls.latestFrame, { camera })
  }

  private async fetchEvent(eventId: string): Promise<FrigateEvent | null> {
    try {
      const response = await fetch(
        settleUrl(frigateUrls.event, this.config.remoteUrl, { id: eventId }),
        { headers: frigateAuthHeaders(this.config) },
      )
      return response.ok ? ((await response.json()) as FrigateEvent) : null
    } catch {
      return null
    }
  }
}
