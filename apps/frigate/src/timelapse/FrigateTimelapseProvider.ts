import type {
  MediaFetch,
  TimelapseJob,
  TimelapseProgress,
  TimelapseProvider,
  TimelapseSpan,
} from '@spotter/sink'
import type { TimelapseSpeed } from '@spotter/transport'
import type { FrigateMediaConfig } from '../config'
import {
  frigateAuthHeaders,
  frigateUrls,
  settleUrl,
} from '../frigate/frigateClient'

/**
 * Frigate's playback factors. The API accepts exactly these two; the actual
 * speed of `timelapse_25x` is whatever `record.export.timelapse_args` says in
 * the Frigate config, so the name is not a promise about the multiplier.
 */
const PLAYBACK: Record<TimelapseSpeed, string> = {
  realtime: 'realtime',
  timelapse: 'timelapse_25x',
}

type FrigateExport = {
  id?: string
  video_path?: string
  in_progress?: boolean
}

/**
 * Frigate implementation of the sink `TimelapseProvider`, built on
 * `POST /api/export/...`. Like the media provider, it is the only component
 * holding Frigate's URL scheme and credentials.
 */
export class FrigateTimelapseProvider implements TimelapseProvider {
  constructor(private readonly config: FrigateMediaConfig) {}

  async startExport(span: TimelapseSpan): Promise<TimelapseJob | null> {
    const url = settleUrl(frigateUrls.exportStart, this.config.remoteUrl, {
      camera: span.camera,
      // Whole seconds: Frigate parses these straight out of the path.
      start: String(Math.floor(span.start)),
      end: String(Math.ceil(span.end)),
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...frigateAuthHeaders(this.config),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        playback: PLAYBACK[span.speed],
        source: 'recordings',
        name: this.exportName(span),
      }),
    })

    if (!response.ok) return null

    const body = (await response.json().catch(() => null)) as {
      export_id?: string
    } | null

    return body?.export_id ? { id: body.export_id } : null
  }

  async pollExport(jobId: string): Promise<TimelapseProgress> {
    const record = await this.findExport(jobId)

    // Absent from the list means Frigate dropped it; it is never coming back.
    if (!record) return { state: 'lost' }
    if (record.in_progress !== false) return { state: 'running' }

    const file = record.video_path?.split('/').pop()
    if (!file) return { state: 'running' }

    return { state: 'ready', fetch: this.download(file) }
  }

  async discardExport(jobId: string): Promise<void> {
    const url = settleUrl(frigateUrls.exportDelete, this.config.remoteUrl, {
      id: jobId,
    })

    await fetch(url, {
      method: 'DELETE',
      headers: frigateAuthHeaders(this.config),
    })
  }

  /**
   * The finished file is served by Frigate's nginx from `/exports/`, behind the
   * same auth as the API — `video_path` points inside the container and is not
   * reachable from here.
   */
  private download(file: string): MediaFetch {
    return new Request(
      settleUrl(frigateUrls.exportFile, this.config.remoteUrl, {
        file: encodeURIComponent(file),
      }),
      { headers: frigateAuthHeaders(this.config) },
    )
  }

  private async findExport(jobId: string): Promise<FrigateExport | null> {
    const url = settleUrl(frigateUrls.exportList, this.config.remoteUrl)

    const response = await fetch(url, {
      headers: frigateAuthHeaders(this.config),
    })

    if (!response.ok) {
      // Distinguishable from "lost": the caller keeps polling on a throw.
      throw new Error(`Frigate exports listing failed (${response.status})`)
    }

    const exports = (await response.json()) as FrigateExport[]
    if (!Array.isArray(exports)) return null

    return exports.find((entry) => entry.id === jobId) ?? null
  }

  private exportName(span: TimelapseSpan): string {
    const stamp = (value: number) =>
      new Date(value * 1000).toISOString().slice(0, 16).replace('T', ' ')

    return `Spotter ${span.camera} ${stamp(span.start)} — ${stamp(span.end)}`
  }
}
