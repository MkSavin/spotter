import {
  type Catalog,
  type CatalogEntry,
  type StreamProducer,
  catalogKey,
  safeParseCatalog,
} from '@spotter/transport'
import type { Stenograph } from 'stenograph'

/**
 * In-memory cache of NVR catalogs, keyed by source. Replaces the bot's
 * hard-coded `cameraLabels`/`objectLabels`: the adapter owns the taxonomy and
 * publishes it (`spotter.catalog.<source>` key + `spotter.catalog.updated`
 * stream); the bot bootstraps from the key on start and stays fresh from the
 * stream. Lookups are synchronous so rendering paths can stay synchronous.
 */
export class CatalogCache {
  private readonly cache = new Map<string, Catalog>()

  constructor(private readonly logger: Stenograph) {}

  /** Store/replace the snapshot for a source (from the catalog.updated stream). */
  apply(snapshot: Catalog): void {
    this.cache.set(snapshot.source, snapshot)
    this.logger.debug(
      `Catalog cached for "${snapshot.source}": ${snapshot.cameras.length} cameras, ${snapshot.objectTypes.length} object types`,
    )
  }

  /** Best-effort bootstrap from the `spotter.catalog.<source>` Redis key. */
  async bootstrap(source: string, producer: StreamProducer): Promise<void> {
    try {
      const raw = (await producer.send('GET', [catalogKey(source)])) as
        | string
        | null

      if (!raw) {
        this.logger.debug(`No catalog snapshot stored yet for "${source}"`)
        return
      }

      const snapshot = safeParseCatalog(JSON.parse(raw))

      if (snapshot) {
        this.apply(snapshot)
      }
    } catch (error) {
      this.logger.warn(`Failed to bootstrap catalog for "${source}"`, error)
    }
  }

  cameras(source: string): CatalogEntry[] {
    return this.cache.get(source)?.cameras ?? []
  }

  objectTypes(source: string): CatalogEntry[] {
    return this.cache.get(source)?.objectTypes ?? []
  }

  cameraLabel(source: string, code: string, fallback: string = code): string {
    return (
      this.cameras(source).find((entry) => entry.code === code)?.label ??
      fallback
    )
  }

  objectLabel(source: string, code: string, fallback: string = code): string {
    return (
      this.objectTypes(source).find((entry) => entry.code === code)?.label ??
      fallback
    )
  }
}
