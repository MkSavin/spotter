import { describe, expect, test } from 'bun:test'
import { InputFile } from 'grammy'
import { InnoxiousMedia, InnoxiousMediaGroup } from './InnoxiousMedia'

// Helper to stub global fetch
const makeFetchStub = (ok = true, bytes = [1, 2, 3]) => {
  return async (_url: string) => {
    return {
      ok,
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    }
  }
}

describe('InnoxiousMedia', () => {
  test('Buffer source returns same InputFile for naive and accurate', async () => {
    const file = new InputFile(Uint8Array.from([10, 20, 30]))

    const media = new InnoxiousMedia({ type: 'photo', media: file })

    const naive = await media.naive()
    const accurate = await media.accurate()

    expect(naive.media).toBe(file)
    expect(accurate.media).toBe(file)
  })

  test('Remote url is returned by naive and fetched by accurate', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = makeFetchStub(true, [4, 5, 6]) as any

      const media = new InnoxiousMedia({
        type: 'photo',
        media: 'https://example.com/pic.jpg',
      })

      const naive = await media.naive()
      // naive should keep remote url string
      expect(naive.media).toBe('https://example.com/pic.jpg')

      const accurate = await media.accurate()
      // accurate should return an InputFile (buffered)
      expect(accurate.media).toBeInstanceOf(InputFile)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('Local url is fetched for naive and accurate', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = makeFetchStub(true, [7, 8, 9]) as any

      const media = new InnoxiousMedia({
        type: 'photo',
        media: 'http://127.0.0.1/file.jpg',
      })

      const naive = await media.naive()
      expect(naive.media).toBeInstanceOf(InputFile)

      const accurate = await media.accurate()
      expect(accurate.media).toBeInstanceOf(InputFile)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('File path returns InputFile for naive and accurate', async () => {
    const media = new InnoxiousMedia({ type: 'photo', media: '/tmp/pic.jpg' })

    const naive = await media.naive()
    const accurate = await media.accurate()

    expect(naive.media).toBeInstanceOf(InputFile)
    expect(accurate.media).toBeInstanceOf(InputFile)
  })

  test('Mixed list resolves correctly for naive and accurate', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = makeFetchStub(true, [11, 12, 13]) as any

      const file = new InputFile(Uint8Array.from([1]))

      const group = new InnoxiousMediaGroup([
        { type: 'photo', media: 'https://example.com/1.jpg' },
        { type: 'photo', media: file },
        { type: 'photo', media: '/var/lib/pic.jpg' },
      ])

      const naive = await group.naive()
      // naive: remote stays string, others are InputFile
      expect(naive[0].media).toBe('https://example.com/1.jpg')
      expect(naive[1].media).toBe(file)
      expect(naive[2].media).toBeInstanceOf(InputFile)

      const accurate = await group.accurate()
      // accurate: all are InputFile
      expect(accurate[0].media).toBeInstanceOf(InputFile)
      expect(accurate[1].media).toBe(file)
      expect(accurate[2].media).toBeInstanceOf(InputFile)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
