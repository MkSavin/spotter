import { parsedController } from '../regulator/parsedController'
import { safeParseCatalog } from '../schema/catalog'
import type { CatalogCache } from './CatalogCache'

/** Any context that carries a catalog cache to refresh. */
export type CatalogAware = { catalog: CatalogCache }

/**
 * Consumes `spotter.catalog.updated` and refreshes the local cache. Identical
 * for every frontend, so all of them share this one.
 */
export const catalogController = parsedController(
  safeParseCatalog,
  async (snapshot, context: CatalogAware) => {
    context.catalog.apply(snapshot)
  },
)
