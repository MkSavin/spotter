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
 */
export const publishCatalog = async (
  catalog: Catalog,
  sourceId: string,
  producer: StreamProducer,
  logger: Stenograph,
): Promise<void> => {
  const [cameras, objectTypes] = await Promise.all([
    catalog.listCameras(),
    catalog.listObjectTypes(),
  ])

  const snapshot: CatalogSnapshot = {
    source: sourceId,
    cameras,
    objectTypes,
  }

  // SET via the producer's non-blocking connection (the subscriber connection
  // is reserved for the blocking XREADGROUP loop). The key serves same-node
  // consumers; the stream carries the full snapshot so split (home/cloud)
  // consumers can bootstrap over the forwarder — keys don't cross it.
  await producer.send('SET', [catalogKey(sourceId), JSON.stringify(snapshot)])
  await producer.publish(catalogUpdatedStream, snapshot)

  logger.info(
    `Published catalog for "${sourceId}": ${cameras.length} cameras, ${objectTypes.length} object types`,
  )
}
