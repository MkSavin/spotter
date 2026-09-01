import type { Catalog } from '@spotter/sink'
import type { CatalogEntry } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../config'
import { toCatalogEntries } from '../config'
import {
  frigateAuthHeaders,
  frigateUrls,
  settleUrl,
} from '../frigate/frigateClient'

/** How long one `/api/config` read stays good before it is fetched again. */
export const CONFIG_TTL_MS = 60_000

/**
 * Builds the catalog from Frigate's `/api/config`: camera names and the global
 * tracked-object list. Labels come from the adapter's configured map (falling
 * back to the raw code). If Frigate is unreachable, falls back to the codes
 * present in the label config so downstream services still get a snapshot.
 */
export class FrigateCatalog implements Catalog {
  private pending: Promise<{
    cameras: string[]
    objects: string[]
  } | null> | null = null
  private fetchedAt = 0

  constructor(
    private readonly config: CoreConfig,
    private readonly logger: Stenograph,
    private readonly ttlMs: number = CONFIG_TTL_MS,
  ) {}

  /**
   * Memoized so `listCameras`/`listObjectTypes` share one `/api/config` hit.
   * The memo expires so cameras added in Frigate are picked up without an
   * adapter restart. A failure is not cached — otherwise a Frigate that was
   * briefly down would leave the catalog empty until the adapter restarts.
   */
  private fetchConfig(): Promise<{
    cameras: string[]
    objects: string[]
  } | null> {
    if (this.pending && Date.now() - this.fetchedAt >= this.ttlMs) {
      this.pending = null
    }

    if (!this.pending) {
      this.fetchedAt = Date.now()
      this.pending = this.loadConfig().then((result) => {
        if (!result) this.pending = null
        return result
      })
    }

    return this.pending
  }

  private async loadConfig(): Promise<{
    cameras: string[]
    objects: string[]
  } | null> {
    try {
      const url = settleUrl(frigateUrls.config, this.config.frigate.remoteUrl)
      const response = await fetch(url, {
        method: 'GET',
        headers: frigateAuthHeaders(this.config.frigate),
      })

      if (!response.ok) {
        this.logger.warn(`Frigate /api/config returned ${response.status}`)
        return null
      }

      const body = (await response.json()) as {
        cameras?: Record<
          string,
          { enabled?: boolean; objects?: { track?: string[] } }
        >
        objects?: { track?: string[] }
      }

      const entries = Object.entries(body.cameras ?? {})

      const enabled = entries.filter(([, camera]) => camera.enabled !== false)

      const cameras = enabled.map(([name]) => name)

      // Object types still come from every camera: the taxonomy is used to
      // render existing events, including ones a since-disabled camera left.
      const objects = new Set<string>(body.objects?.track ?? [])
      for (const [, camera] of entries) {
        for (const object of camera.objects?.track ?? []) {
          objects.add(object)
        }
      }

      return { cameras, objects: [...objects] }
    } catch (error) {
      this.logger.warn('Failed to fetch Frigate config for catalog:', error)
      return null
    }
  }

  async listCameras(): Promise<CatalogEntry[]> {
    const fetched = await this.fetchConfig()
    const codes = fetched?.cameras ?? Object.keys(this.config.labels.cameras)
    return toCatalogEntries(codes, this.config.labels.cameras)
  }

  async listObjectTypes(): Promise<CatalogEntry[]> {
    const fetched = await this.fetchConfig()
    const codes = fetched?.objects ?? Object.keys(this.config.labels.objects)
    return toCatalogEntries(codes, this.config.labels.objects)
  }
}
