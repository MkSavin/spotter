import { describe, expect, test } from 'bun:test'
import {
  type Catalog,
  catalogKey,
  catalogUpdatedStream,
  parseCatalog,
  safeParseCatalog,
} from './catalog'

const valid: Catalog = {
  source: 'frigate-home',
  cameras: [{ code: 'front', label: 'Front door' }],
  objectTypes: [{ code: 'person', label: 'Человек' }],
}

describe('catalog contract', () => {
  test('accepts a valid catalog', () => {
    expect(safeParseCatalog(valid)).toEqual(valid)
    expect(() => parseCatalog(valid)).not.toThrow()
  })

  test('allows empty taxonomies', () => {
    expect(
      safeParseCatalog({ source: 's', cameras: [], objectTypes: [] }),
    ).not.toBeNull()
  })

  test('rejects entries missing code or label', () => {
    expect(
      safeParseCatalog({ ...valid, cameras: [{ code: 'front' }] }),
    ).toBeNull()
    expect(
      safeParseCatalog({ ...valid, objectTypes: [{ label: 'x' }] }),
    ).toBeNull()
  })

  test('rejects empty source', () => {
    expect(safeParseCatalog({ ...valid, source: '' })).toBeNull()
  })

  test('key/stream helpers', () => {
    expect(catalogKey('frigate-home')).toBe('spotter.catalog.frigate-home')
    expect(catalogUpdatedStream).toBe('spotter.catalog.updated')
  })
})
