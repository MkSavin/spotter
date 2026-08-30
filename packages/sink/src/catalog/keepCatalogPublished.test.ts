import { describe, expect, test } from 'bun:test'
import type { StreamProducer } from '@spotter/transport'
import { Stenograph } from 'stenograph'
import type { Catalog } from './Catalog'
import { keepCatalogPublished } from './keepCatalogPublished'

const silent = new Stenograph({ transport: [] })

const makeProducer = () => {
  const sent: string[] = []
  const producer = {
    send: async (command: string) => {
      sent.push(command)
    },
    publish: async () => undefined,
  } as unknown as StreamProducer
  return { producer, sent }
}

/** Reports no cameras until `after` calls have been made. */
const flakyCatalog = (after: number): Catalog => {
  let calls = 0
  return {
    listCameras: async () => {
      calls++
      return calls > after ? [{ code: 'front', label: 'Front' }] : []
    },
    listObjectTypes: async () => [{ code: 'person', label: 'Человек' }],
  }
}

const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

describe('keepCatalogPublished', () => {
  test('publishes a catalog that is ready right away', async () => {
    const { producer, sent } = makeProducer()
    const stop = keepCatalogPublished(
      flakyCatalog(0),
      'frigate',
      producer,
      silent,
      10,
    )
    await settle(20)
    stop()

    expect(sent).toEqual(['SET'])
  })

  test('never publishes an empty catalog', async () => {
    // An empty snapshot would overwrite a good one and blank the camera list.
    const { producer, sent } = makeProducer()
    const stop = keepCatalogPublished(
      { listCameras: async () => [], listObjectTypes: async () => [] },
      'frigate',
      producer,
      silent,
      10,
    )
    await settle(25)
    stop()

    expect(sent).toEqual([])
  })

  test('keeps trying until the NVR answers', async () => {
    const { producer, sent } = makeProducer()
    const stop = keepCatalogPublished(
      flakyCatalog(2),
      'frigate',
      producer,
      silent,
      10,
    )
    await settle(60)
    stop()

    expect(sent).toEqual(['SET'])
  })

  test('stops retrying once stopped', async () => {
    const { producer, sent } = makeProducer()
    const stop = keepCatalogPublished(
      flakyCatalog(5),
      'frigate',
      producer,
      silent,
      10,
    )
    stop()
    await settle(60)

    expect(sent).toEqual([])
  })

  test('republishes when the camera list changes', async () => {
    let cameras = [{ code: 'front', label: 'Front' }]
    const { producer, sent } = makeProducer()
    const stop = keepCatalogPublished(
      {
        listCameras: async () => cameras,
        listObjectTypes: async () => [],
      },
      'frigate',
      producer,
      silent,
      10,
      10,
    )
    await settle(25)
    cameras = [
      { code: 'front', label: 'Front' },
      { code: 'yard', label: 'Yard' },
    ]
    await settle(30)
    stop()

    expect(sent.filter((c) => c === 'SET')).toHaveLength(2)
  })

  test('an unchanged catalog is not republished on refresh', async () => {
    const { producer, sent } = makeProducer()
    const stop = keepCatalogPublished(
      flakyCatalog(0),
      'frigate',
      producer,
      silent,
      10,
      10,
    )
    await settle(60)
    stop()

    expect(sent).toEqual(['SET'])
  })

  test('a throwing catalog is retried, not fatal', async () => {
    let calls = 0
    const { producer, sent } = makeProducer()
    const stop = keepCatalogPublished(
      {
        listCameras: async () => {
          calls++
          if (calls === 1) throw new Error('connect ECONNREFUSED')
          return [{ code: 'front', label: 'Front' }]
        },
        listObjectTypes: async () => [{ code: 'person', label: 'Человек' }],
      },
      'frigate',
      producer,
      silent,
      10,
    )
    await settle(40)
    stop()

    expect(sent).toEqual(['SET'])
  })
})
