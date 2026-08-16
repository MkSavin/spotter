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

  constructor(
    private readonly config: CoreConfig,
    private readonly logger: Stenograph,
  ) {}

  /**
   * Memoized so `listCameras`/`listObjectTypes` share one `/api/config` hit.
   * A failure is not cached — otherwise a Frigate that was briefly down would
   * leave the catalog empty until the adapter restarts.
   */
  private fetchConfig(): Promise<{
    cameras: string[]
    objects: string[]
  } | null> {
    this.pending ??= this.loadConfig().then((result) => {
      if (!result) this.pending = null
      return result
    })
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
        cameras?: Record<string, { objects?: { track?: string[] } }>
        objects?: { track?: string[] }
      }

      const cameras = Object.keys(body.cameras ?? {})
      const objects = new Set<string>(body.objects?.track ?? [])
      for (const camera of Object.values(body.cameras ?? {})) {
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
