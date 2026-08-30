import {
  type Catalog as CatalogSnapshot,
  catalogKey,
  catalogUpdatedStream,
  type StreamProducer,
} from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { Catalog } from './Catalog'

/**
 * Snapshots the adapter's catalog (cameras + object types) and stores it under
 * the `spotter.catalog.<source>` Redis key, then notifies consumers via the
 * `spotter.catalog.updated` stream. Consumers read the key on demand and cache
 * it — replacing the bot's hard-coded `cameraLabels`/`objectLabels`.
 *
 * `previous` short-circuits an unchanged snapshot so the refresh loop does not
 * wake every consumer on a timer.
 */
export const publishCatalog = async (
  catalog: Catalog,
  sourceId: string,
  producer: StreamProducer,
  logger: Stenograph,
  previous?: { value: string | undefined },
): Promise<boolean> => {
  const [cameras, objectTypes] = await Promise.all([
    catalog.listCameras(),
    catalog.listObjectTypes(),
  ])

  // An empty snapshot would overwrite a good one and leave the bot saying
  // "Список камер пока недоступен" until the adapter restarts.
  if (cameras.length === 0) {
    logger.warn(`Catalog for "${sourceId}" is empty — not publishing`)
    return false
  }

  const snapshot: CatalogSnapshot = {
    source: sourceId,
    cameras,
    objectTypes,
  }

  const serialized = JSON.stringify(snapshot)

  if (previous && previous.value === serialized) {
    logger.debug(`Catalog for "${sourceId}" unchanged`)
    return true
  }

  // SET via the producer's non-blocking connection (the subscriber connection
  // is reserved for the blocking XREADGROUP loop). The key serves same-node
  // consumers; the stream carries the full snapshot so split (home/cloud)
  // consumers can bootstrap over the forwarder — keys don't cross it.
  await producer.send('SET', [catalogKey(sourceId), serialized])
  await producer.publish(catalogUpdatedStream, snapshot)

  if (previous) previous.value = serialized

  logger.info(
    `Published catalog for "${sourceId}": ${cameras.length} cameras, ${objectTypes.length} object types`,
  )
  return true
}
