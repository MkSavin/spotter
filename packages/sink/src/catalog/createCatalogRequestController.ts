import {
  parsedController,
  type StreamMessageController,
  safeParseCatalogRequest,
} from '@spotter/transport'
import type { SinkConfig } from '../config/sinkConfig'
import type { SinkContext } from '../runtime/context'

/**
 * The catalog key is node-local and does not cross the forwarder, so asking is
 * the only way for a remote consumer to get it without waiting for a change.
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
