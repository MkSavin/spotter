import type { CatalogEntry } from '@spotter/transport'

/**
 * Owns the NVR taxonomy — the list of cameras and detectable object types. The
 * source of truth is the adapter's choice: query the NVR (Frigate exposes
 * cameras at `/api/config`) or the adapter's own config. The runtime snapshots
 * this into the `spotter.catalog.<source>` Redis key so downstream services
 * stop hard-coding `cameraLabels`/`objectLabels`.
 */
export interface Catalog {
  /** Cameras the NVR exposes, as `{ code, label }`. */
  listCameras(): CatalogEntry[] | Promise<CatalogEntry[]>
  /** Object types the NVR can detect, as `{ code, label }`. */
  listObjectTypes(): CatalogEntry[] | Promise<CatalogEntry[]>
}
