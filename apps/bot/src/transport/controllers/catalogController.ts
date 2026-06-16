import {
  type StreamMessageController,
  bufferToJson,
  safeParseCatalog,
} from '@spotter/transport'
import type { TransportContext } from '../../context'

/**
 * Keeps the in-memory {@link CatalogCache} fresh. The adapter publishes a full
 * catalog snapshot to `spotter.catalog.updated` on start and on change; in a
 * split (home/cloud) deployment the snapshot rides the stream because the
 * `spotter.catalog.<source>` key itself does not cross the forwarder.
 */
export const catalogController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)

  if (!value) {
    return
  }

  const snapshot = safeParseCatalog(value)

  if (!snapshot) {
    return
  }

  context.catalog.apply(snapshot)
}
