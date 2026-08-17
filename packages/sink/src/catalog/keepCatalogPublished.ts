import type { StreamProducer } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { Catalog } from './Catalog'
import { publishCatalog } from './publishCatalog'

/** How long to wait before asking the NVR for its catalog again. */
export const CATALOG_RETRY_MS = 60_000

/**
 * Publishes the catalog, retrying until it lands. An NVR that is slow to start
 * would otherwise leave the bot without camera names until the adapter restarts.
 */
export const keepCatalogPublished = (
  catalog: Catalog,
  sourceId: string,
  producer: StreamProducer,
  logger: Stenograph,
  retryMs = CATALOG_RETRY_MS,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const attempt = async (): Promise<void> => {
    if (stopped) return
    const published = await publishCatalog(
      catalog,
      sourceId,
      producer,
      logger,
    ).catch((error) => {
      logger.warn(`Catalog publish failed: ${error}`)
      return false
    })
    if (published || stopped) return
    timer = setTimeout(() => void attempt(), retryMs)
    timer.unref?.()
  }

  void attempt()

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
