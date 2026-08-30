import type { StreamProducer } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { Catalog } from './Catalog'
import { publishCatalog } from './publishCatalog'

/** How long to wait before asking the NVR for its catalog again. */
export const CATALOG_RETRY_MS = 60_000

/** How long to wait between refreshes once a catalog has been published. */
export const CATALOG_REFRESH_MS = 600_000

/**
 * Keeps the published catalog in sync with the NVR: retries a fast interval
 * until the first snapshot lands, then re-checks on a slow one.
 */
export const keepCatalogPublished = (
  catalog: Catalog,
  sourceId: string,
  producer: StreamProducer,
  logger: Stenograph,
  retryMs = CATALOG_RETRY_MS,
  refreshMs = CATALOG_REFRESH_MS,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const previous: { value: string | undefined } = { value: undefined }

  const attempt = async (): Promise<void> => {
    if (stopped) return

    const published = await publishCatalog(
      catalog,
      sourceId,
      producer,
      logger,
      previous,
    ).catch((error) => {
      logger.warn(`Catalog publish failed: ${error}`)
      return false
    })

    if (stopped) return

    timer = setTimeout(() => void attempt(), published ? refreshMs : retryMs)
    timer.unref?.()
  }

  void attempt()

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
