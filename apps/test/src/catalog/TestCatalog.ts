import type { Catalog } from '@spotter/sink'
import type { CatalogEntry } from '@spotter/transport'
import { type TestConfig, toCatalogEntries } from '../config'

/**
 * Synthetic catalog built straight from the configured labels — no network. Lets
 * the bot's `camera_list`, snapshot validation and label rendering work offline.
 */
export class TestCatalog implements Catalog {
  constructor(private readonly config: TestConfig) {}

  listCameras(): CatalogEntry[] {
    return toCatalogEntries(
      Object.keys(this.config.labels.cameras),
      this.config.labels.cameras,
    )
  }

  listObjectTypes(): CatalogEntry[] {
    return toCatalogEntries(
      Object.keys(this.config.labels.objects),
      this.config.labels.objects,
    )
  }
}
