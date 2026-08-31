import { describe, expect, mock, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { SinkContext } from '../runtime/context'
import { createCatalogRequestController } from './createCatalogRequestController'

const context = {
  sourceId: 'frigate',
  logger: defaultLogger,
} as unknown as SinkContext

const message = (value: unknown) => ({
  topic: 'spotter.catalog.request',
  message: { value: JSON.stringify(value) } as never,
})

describe('createCatalogRequestController', () => {
  test('republishes when addressed to this source', async () => {
    const republish = mock(async () => undefined)
    await createCatalogRequestController(republish)(
      message({ source: 'frigate' }),
      context,
    )

    expect(republish).toHaveBeenCalledTimes(1)
  })

  test('answers an unaddressed broadcast', async () => {
    const republish = mock(async () => undefined)
    await createCatalogRequestController(republish)(message({}), context)

    expect(republish).toHaveBeenCalledTimes(1)
  })

  test('ignores a request meant for another source', async () => {
    const republish = mock(async () => undefined)
    await createCatalogRequestController(republish)(
      message({ source: 'unifi' }),
      context,
    )

    expect(republish).not.toHaveBeenCalled()
  })

  test('ignores a payload that is not a catalog request', async () => {
    const republish = mock(async () => undefined)
    await createCatalogRequestController(republish)(
      message({ source: 42 }),
      context,
    )

    expect(republish).not.toHaveBeenCalled()
  })
})
