import { describe, expect, test } from 'bun:test'
import { Stenograph } from 'stenograph'
import type { StreamProducer } from '../regulator/RedisRegulator'
import { type Catalog, catalogRequestStream } from '../schema/catalog'
import { CatalogCache, type CatalogStore } from './CatalogCache'

const silent = new Stenograph({ transport: [] })

const snapshot: Catalog = {
  source: 'frigate',
  cameras: [{ code: 'front', label: 'Двор' }],
  objectTypes: [{ code: 'person', label: 'Человек' }],
}

/** A producer whose GET answer stands in for the node-local snapshot key. */
const makeProducer = (stored: string | null = null) => {
  const published: Array<{ stream: string; payload: unknown }> = []
  const producer = {
    send: async () => stored,
    publish: async (stream: string, payload: unknown) => {
      published.push({ stream, payload })
      return '1-0'
    },
  } as unknown as StreamProducer
  return { producer, published }
}

const memoryStore = (initial?: Catalog) => {
  const rows = new Map<string, Catalog>()
  if (initial) rows.set(initial.source, initial)
  return {
    rows,
    store: {
      load: (source) => rows.get(source),
      save: (value) => {
        rows.set(value.source, value)
      },
    } satisfies CatalogStore,
  }
}

describe('CatalogCache persistence', () => {
  test('applying a snapshot writes it to the store', () => {
    const { rows, store } = memoryStore()
    new CatalogCache(silent, store).apply(snapshot)

    expect(rows.get('frigate')).toEqual(snapshot)
  })

  test('a failing store does not lose the live catalog', () => {
    const cache = new CatalogCache(silent, {
      load: () => undefined,
      save: () => {
        throw new Error('disk full')
      },
    })

    cache.apply(snapshot)

    expect(cache.cameras('frigate')).toHaveLength(1)
  })

  test('bootstrap falls back to the stored copy when the key is absent', async () => {
    // The cloud node's Redis never holds the key: it does not cross the
    // forwarder.
    const { store } = memoryStore(snapshot)
    const cache = new CatalogCache(silent, store)
    const { producer } = makeProducer(null)

    await cache.bootstrap('frigate', producer)

    expect(cache.cameraLabel('frigate', 'front')).toBe('Двор')
  })

  test('the local key wins over the stored copy', async () => {
    const { store } = memoryStore(snapshot)
    const cache = new CatalogCache(silent, store)
    const fresher: Catalog = {
      ...snapshot,
      cameras: [{ code: 'front', label: 'Новый двор' }],
    }
    const { producer } = makeProducer(JSON.stringify(fresher))

    await cache.bootstrap('frigate', producer)

    expect(cache.cameraLabel('frigate', 'front')).toBe('Новый двор')
  })
})

describe('CatalogCache republish request', () => {
  test('bootstrap asks the adapter when the key is missing', async () => {
    const cache = new CatalogCache(silent)
    const { producer, published } = makeProducer(null)

    await cache.bootstrap('frigate', producer)

    expect(published).toEqual([
      { stream: catalogRequestStream, payload: { source: 'frigate' } },
    ])
  })

  test('a stored copy still triggers a request, in case it is stale', async () => {
    const { store } = memoryStore(snapshot)
    const cache = new CatalogCache(silent, store)
    const { producer, published } = makeProducer(null)

    await cache.bootstrap('frigate', producer)

    expect(published).toHaveLength(1)
  })

  test('a present local key needs no request', async () => {
    const cache = new CatalogCache(silent)
    const { producer, published } = makeProducer(JSON.stringify(snapshot))

    await cache.bootstrap('frigate', producer)

    expect(published).toHaveLength(0)
  })
})
