import { pathToFileURL } from 'node:url'
import type { MediaFetch, MediaProvider } from '@spotter/sink'
import { file } from 'bun'
import type { Stenograph } from 'stenograph'
import type { TestConfig } from '../config'

/**
 * Serves committed local fixtures instead of a real NVR. Returns `file://`
 * requests the sink runtime fetches and stages into S3 exactly like real media,
 * so the whole request → staged → processed → presign pipeline runs offline.
 */
export class TestMediaProvider implements MediaProvider {
  constructor(
    private readonly fixtures: TestConfig['fixtures'],
    private readonly logger: Stenograph,
  ) {}

  private async fixtureRequest(path: string): Promise<MediaFetch | null> {
    if (!(await file(path).exists())) {
      this.logger.warn(`Fixture not found, skipping: ${path}`)
      return null
    }
    return new Request(pathToFileURL(path).href)
  }

  resolveClip(): Promise<MediaFetch | null> {
    return this.fixtureRequest(this.fixtures.clip)
  }

  resolveSnapshot(): Promise<MediaFetch | null> {
    return this.fixtureRequest(this.fixtures.snapshot)
  }

  resolveFrame(): Promise<MediaFetch | null> {
    return this.fixtureRequest(this.fixtures.frame)
  }
}
