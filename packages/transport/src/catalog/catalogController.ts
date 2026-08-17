import { bufferToJson } from '../helpers/bufferToJson'
import type { StreamMessageController } from '../regulator/RedisRegulator'
import { safeParseCatalog } from '../schema/catalog'
import type { CatalogCache } from './CatalogCache'

/** Any context that carries a catalog cache to refresh. */
export type CatalogAware = { catalog: CatalogCache }

/**
 * Consumes `spotter.catalog.updated` and refreshes the local cache. Identical
 * for every frontend, so all of them share this one.
 */
export const catalogController: StreamMessageController<CatalogAware> = async (
  payload,
  context,
): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const snapshot = safeParseCatalog(value)
  if (!snapshot) return

  context.catalog.apply(snapshot)
}
