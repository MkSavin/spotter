import {
  type Catalog as CatalogSnapshot,
  catalogKey,
  catalogUpdatedStream,
  type StreamProducer,
} from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { Catalog } from './Catalog'

/**
 * `previous` skips an unchanged snapshot so the refresh loop wakes nobody;
 * `force` publishes anyway, for a consumer that restarted and missed one.
 */
export const publishCatalog = async (
  catalog: Catalog,
  sourceId: string,
  producer: StreamProducer,
  logger: Stenograph,
  previous?: { value: string | undefined },
  force = false,
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

  const unchanged = previous?.value === serialized
  if (unchanged && !force) return true

  // SET via the producer's non-blocking connection (the subscriber connection
  // is reserved for the blocking XREADGROUP loop). The key serves same-node
  // consumers; the stream carries the full snapshot so split (home/cloud)
  // consumers can bootstrap over the forwarder — keys don't cross it.
  await producer.send('SET', [catalogKey(sourceId), serialized])
  await producer.publish(catalogUpdatedStream, snapshot)

  const isFirst = previous?.value === undefined

  if (previous) previous.value = serialized

  /**
   * Only a catalog that actually differs is news — cameras appeared or went
   * away. A forced republish of an identical list is bookkeeping, and at one
   * an hour per source it buries the lines worth reading.
   */
  const message = `Published catalog for "${sourceId}": ${cameras.length} cameras, ${objectTypes.length} object types`
  if (unchanged) logger.debug(message)
  else if (isFirst || previous) logger.info(message)
  else logger.debug(message)

  return true
}
