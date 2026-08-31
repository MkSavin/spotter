import type { Stenograph } from 'stenograph'
import type { StreamProducer } from '../regulator/RedisRegulator'
import {
  type Catalog,
  type CatalogEntry,
  catalogKey,
  catalogRequestStream,
  safeParseCatalog,
} from '../schema/catalog'

/**
 * Durable copy of the catalog, so a restart does not start blank. Implemented
 * by each consumer over its own database; the cache stays storage-agnostic.
 */
export type CatalogStore = {
  load: (source: string) => Catalog | undefined
  save: (snapshot: Catalog) => void
}

/**
 * Read-only cache of camera/object display labels, kept in sync from
 * `spotter.catalog.<source>`. Every delivery frontend needs the same
 * `code → label` resolution, so it lives here rather than in each service —
 * consumers stay free of NVR knowledge.
 */
export class CatalogCache {
  private readonly cache = new Map<string, Catalog>()

  constructor(
    private readonly logger: Stenograph,
    private readonly store?: CatalogStore,
  ) {}

  apply(snapshot: Catalog): void {
    this.cache.set(snapshot.source, snapshot)

    try {
      this.store?.save(snapshot)
    } catch (error) {
      // Durability is a bonus; a failed write must not drop the live catalog.
      this.logger.warn(
        `Failed to persist catalog for "${snapshot.source}"`,
        error,
      )
    }

    this.logger.debug(
      `Catalog cached for "${snapshot.source}": ${snapshot.cameras.length} cameras, ${snapshot.objectTypes.length} object types`,
    )
  }

  /**
   * Restores the catalog at startup: the local snapshot key first, then the
   * durable copy, and finally a republish request. On a split deployment the
   * key belongs to the ingest node, so the cloud only ever has the last two.
   */
  async bootstrap(source: string, producer: StreamProducer): Promise<void> {
    try {
      const raw = (await producer.send('GET', [catalogKey(source)])) as
        | string
        | null

      const snapshot = raw ? safeParseCatalog(JSON.parse(raw)) : null
      if (snapshot) {
        this.apply(snapshot)
        return
      }
    } catch (error) {
      this.logger.warn(`Failed to bootstrap catalog for "${source}"`, error)
    }

    const stored = this.restore(source)
    if (stored) {
      this.logger.debug(`Catalog for "${source}" restored from storage`)
    }

    // Even with a stored copy: it may predate a camera being added.
    await this.request(source, producer)
  }

  private restore(source: string): boolean {
    try {
      const stored = this.store?.load(source)
      if (!stored) return false
      this.cache.set(source, stored)
      return true
    } catch (error) {
      this.logger.warn(`Failed to read stored catalog for "${source}"`, error)
      return false
    }
  }

  /**
   * Asks the owning adapter to republish. The snapshot key is node-local and
   * does not cross the forwarder, so a consumer on another node has nothing to
   * bootstrap from until the taxonomy happens to change.
   */
  async request(source: string, producer: StreamProducer): Promise<void> {
    try {
      await producer.publish(catalogRequestStream, { source })
      this.logger.debug(`Requested a catalog republish for "${source}"`)
    } catch (error) {
      this.logger.warn(`Failed to request catalog for "${source}"`, error)
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
