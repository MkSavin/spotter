import type { MediaFetch, MediaProvider } from '@spotter/sink'
import type { FrigateMediaConfig } from '../config'
import { frigateMediaRequest, frigateUrls } from '../frigate/frigateClient'

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

  resolveFrame(camera: string): MediaFetch {
    return frigateMediaRequest(this.config, frigateUrls.latestFrame, { camera })
  }
}
