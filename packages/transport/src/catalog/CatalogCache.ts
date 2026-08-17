import type { Stenograph } from 'stenograph'
import type { StreamProducer } from '../regulator/RedisRegulator'
import {
  type Catalog,
  type CatalogEntry,
  catalogKey,
  safeParseCatalog,
} from '../schema/catalog'

/**
 * Read-only cache of camera/object display labels, kept in sync from
 * `spotter.catalog.<source>`. Every delivery frontend needs the same
 * `code → label` resolution, so it lives here rather than in each service —
 * consumers stay free of NVR knowledge.
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

  /** Loads the last snapshot published before this consumer started. */
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
    return this.cameras(source).find((e) => e.code === code)?.label ?? fallback
  }

  objectLabel(source: string, code: string, fallback: string = code): string {
    return (
      this.objectTypes(source).find((e) => e.code === code)?.label ?? fallback
    )
  }
}
