import { z } from 'zod'

/**
 * NVR taxonomy snapshot.
 *
 * The list of cameras and the object types an NVR can detect are properties of
 * the NVR, not of any downstream consumer. The adapter owns this taxonomy and
 * publishes a `Catalog` snapshot to the Redis key `spotter.catalog.<source>`
 * (on start and on change), notifying via `spotter.catalog.updated`.
 *
 * bot/server reads and caches it for `camera_list`, snapshot-command
 * validation and `code → label` rendering — instead of carrying hard-coded
 * `cameraLabels`/`objectLabels`.
 */

/** A single `{ code, label }` entry — a stable code and its display label. */
export const catalogEntrySchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
})
export type CatalogEntry = z.infer<typeof catalogEntrySchema>

export const catalogSchema = z.object({
  source: z.string().min(1),
  cameras: z.array(catalogEntrySchema),
  objectTypes: z.array(catalogEntrySchema),
})
export type Catalog = z.infer<typeof catalogSchema>

/** Redis key holding the latest catalog snapshot for a source. */
export const catalogKey = (source: string): string =>
  `spotter.catalog.${source}`

/** Stream notified whenever any source's catalog changes. */
export const catalogUpdatedStream = 'spotter.catalog.updated'

/** Throws `ZodError` on invalid input. Use when producing the catalog. */
export const parseCatalog = (value: unknown): Catalog =>
  catalogSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseCatalog = (value: unknown): Catalog | null => {
  const result = catalogSchema.safeParse(value)
  return result.success ? result.data : null
}
