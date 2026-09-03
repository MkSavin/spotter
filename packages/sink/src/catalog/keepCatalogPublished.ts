import type { StreamProducer } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { Catalog } from './Catalog'
import { publishCatalog } from './publishCatalog'

/** How long to wait before asking the NVR for its catalog again. */
export const CATALOG_RETRY_MS = 60_000

/** How long to wait between refreshes once a catalog has been published. */
export const CATALOG_REFRESH_MS = 600_000

/**
 * Republish even when nothing changed after this many quiet refreshes, so a
 * consumer that restarted and missed the last publish still gets one.
 */
export const CATALOG_FORCE_EVERY = 6

export type CatalogHandle = {
  stop: () => void
  /** Publishes the current catalog regardless of whether it changed. */
  republish: () => Promise<void>
}

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
  forceEvery = CATALOG_FORCE_EVERY,
): CatalogHandle => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let quiet = 0
  const previous: { value: string | undefined } = { value: undefined }

  const publish = (force: boolean): Promise<boolean> =>
    publishCatalog(catalog, sourceId, producer, logger, previous, force).catch(
      (error) => {
        logger.warn(`Catalog publish failed: ${error}`)
        return false
      },
    )

  const attempt = async (): Promise<void> => {
    if (stopped) return

    // A forced round also refreshes the memo, so the next quiet round compares
    // against what was actually sent.
    const force = forceEvery > 0 && quiet >= forceEvery
    if (force) {
      quiet = 0
    } else {
      quiet += 1
    }

    const published = await publish(force)

    if (stopped) return

    timer = setTimeout(() => void attempt(), published ? refreshMs : retryMs)
    timer.unref?.()
  }

  void attempt()

  return {
    stop: () => {
      stopped = true
      clearTimeout(timer)
    },
    republish: async () => {
      quiet = 0
      await publish(true)
    },
  }
}
