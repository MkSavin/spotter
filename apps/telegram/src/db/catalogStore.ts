import {
  type Catalog,
  type CatalogStore,
  safeParseCatalog,
} from '@spotter/transport'
import type { TelegramDatabase } from './client'
import { catalogSnapshotsRepo } from './repository'

/** Backs the shared CatalogCache with this service's SQLite database. */
export const catalogStore = (db: TelegramDatabase): CatalogStore => ({
  load: (source: string): Catalog | undefined => {
    const row = catalogSnapshotsRepo.find(db, source)
    if (!row) return undefined
    return safeParseCatalog(JSON.parse(row.snapshot)) ?? undefined
  },

  save: (snapshot: Catalog): void => {
    catalogSnapshotsRepo.save(db, snapshot.source, JSON.stringify(snapshot))
  },
})
