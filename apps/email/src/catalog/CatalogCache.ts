import {
  type Catalog,
  type CatalogEntry,
  type StreamProducer,
  catalogKey,
  safeParseCatalog,
} from '@spotter/transport'
import type { Stenograph } from 'stenograph'

/**
 * Read-only cache of camera/object display labels, kept in sync from
 * `spotter.catalog.<source>`. Mirrors the telegram frontend's cache so
 * `renderEmail` can resolve human-readable labels without NVR knowledge.
 */
export class CatalogCache {
  private readonly cache = new Map<string, Catalog>()

  constructor(private readonly logger: Stenograph) {}

  apply(snapshot: Catalog): void {
    this.cache.set(snapshot.source, snapshot)
    this.logger.debug(
      `Catalog cached for "${snapshot.source}": ${snapshot.cameras.length} cameras, ${snapshot.objectTypes.length} object types`,
    )
  }

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
      if (snapshot) this.apply(snapshot)
    } catch (error) {
      this.logger.warn(`Failed to bootstrap catalog for "${source}"`, error)
    }
  }

  cameraLabel(source: string, code: string, fallback: string = code): string {
    return (
      this.cache.get(source)?.cameras.find((e) => e.code === code)?.label ??
      fallback
    )
  }

  objectLabel(source: string, code: string, fallback: string = code): string {
    return (
      this.cache
        .get(source)
        ?.objectTypes.find((e: CatalogEntry) => e.code === code)?.label ??
      fallback
    )
  }
}
