import {
  parsedController,
  type StreamMessageController,
  safeParseCatalogRequest,
} from '@spotter/transport'
import type { SinkConfig } from '../config/sinkConfig'
import type { SinkContext } from '../runtime/context'

/**
 * Answers `spotter.catalog.request` by republishing this source's catalog.
 *
 * A consumer on another node cannot read the `spotter.catalog.<source>` key —
 * it is node-local and does not cross the forwarder — and its consumer group
 * only sees messages published after it started. Asking is the only way for it
 * to recover the catalog without waiting for the NVR taxonomy to change.
 */
export const createCatalogRequestController = <TConfig extends SinkConfig>(
  republish: () => Promise<void>,
): StreamMessageController<SinkContext<TConfig>> =>
  parsedController(
    safeParseCatalogRequest,
    async (request, context: SinkContext<TConfig>) => {
      // An unaddressed request is a broadcast: every adapter answers.
      if (request.source && request.source !== context.sourceId) return

      context.logger
        .sub('catalog')
        .debug(`Republishing catalog for "${context.sourceId}" on request`)

      await republish()
    },
  )
