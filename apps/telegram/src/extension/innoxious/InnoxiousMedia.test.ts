import { describe, expect, test } from 'bun:test'
import { InputFile } from 'grammy'
import {
  InnoxiousMedia,
  InnoxiousMediaGroup,
  MediaTooLargeError,
} from './InnoxiousMedia'

// Helper to stub global fetch
const makeFetchStub = (ok = true, bytes = [1, 2, 3]) => {
  return async (_url: string) =>
    new Response(Uint8Array.from(bytes), { status: ok ? 200 : 500 })
}

/** The path a downloaded file was handed to grammY under. */
const pathOf = (file: unknown): string =>
  (file as { fileData: string }).fileData

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
      // On disk, not in memory: a clip may be hundreds of megabytes.
      expect(await Bun.file(pathOf(accurate.media)).bytes()).toEqual(
        Uint8Array.from([4, 5, 6]),
      )
      await media.dispose()
      expect(await Bun.file(pathOf(accurate.media)).exists()).toBe(false)
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

describe('InnoxiousMedia URL limit', () => {
  /** Answers the ranged size probe, then serves the bytes. */
  const makeSizedFetch = (size: number) =>
    (async (_url: string, init?: RequestInit) => {
      const ranged = new Headers(init?.headers).has('range')
      return new Response(
        ranged ? Uint8Array.from([0]) : Uint8Array.from([1, 2]),
        {
          status: ranged ? 206 : 200,
          headers: ranged ? { 'content-range': `bytes 0-0/${size}` } : {},
        },
      )
    }) as typeof fetch

  test('a video over 20 MB is sent as bytes, not as a URL Telegram would refuse', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = makeSizedFetch(29_510_000)

      const media = new InnoxiousMedia({
        type: 'video',
        media: 'https://s3.example.com/clip.mp4',
      })

      expect((await media.naive()).media).toBeInstanceOf(InputFile)
      await media.dispose()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('a video within the limit keeps its URL', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = makeSizedFetch(19_000_000)

      const media = new InnoxiousMedia({
        type: 'video',
        media: 'https://s3.example.com/clip.mp4',
      })

      expect((await media.naive()).media).toBe(
        'https://s3.example.com/clip.mp4',
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('a photo has the smaller 5 MB limit', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = makeSizedFetch(6_000_000)

      const media = new InnoxiousMedia({
        type: 'photo',
        media: 'https://s3.example.com/snap.jpg',
      })

      expect((await media.naive()).media).toBeInstanceOf(InputFile)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('InnoxiousMedia caching', () => {
  test('a failed download is retried rather than replayed', async () => {
    const originalFetch = globalThis.fetch
    try {
      let calls = 0
      // A refused link is final for that attempt; the next call asks again.
      globalThis.fetch = (async () => {
        calls += 1
        if (calls === 1) return new Response('gone', { status: 404 })
        return new Response(Uint8Array.from([1]))
      }) as unknown as typeof fetch

      const media = new InnoxiousMedia({
        type: 'photo',
        media: 'https://s3.example.com/snap.jpg',
      })

      await expect(media.accurate()).rejects.toThrow('HTTP 404')
      expect((await media.accurate()).media).toBeInstanceOf(InputFile)
      await media.dispose()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('a successful download is fetched once', async () => {
    const originalFetch = globalThis.fetch
    try {
      let calls = 0
      globalThis.fetch = (async () => {
        calls += 1
        return new Response(Uint8Array.from([1]))
      }) as unknown as typeof fetch

      const media = new InnoxiousMedia({
        type: 'photo',
        media: 'https://s3.example.com/snap.jpg',
      })

      await media.accurate()
      await media.accurate()
      expect(calls).toBe(1)
      await media.dispose()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('InnoxiousMedia upload limit', () => {
  const sized = (size: number) =>
    (async (_url: string, init?: RequestInit) => {
      const ranged = new Headers(init?.headers).has('range')
      return new Response(
        ranged ? Uint8Array.from([0]) : Uint8Array.from([1, 2]),
        {
          status: ranged ? 206 : 200,
          headers: ranged ? { 'content-range': `bytes 0-0/${size}` } : {},
        },
      )
    }) as typeof fetch

  test('a file over the upload limit is refused before any download', async () => {
    const originalFetch = globalThis.fetch
    try {
      let calls = 0
      globalThis.fetch = (async () => {
        calls += 1
        return new Response(Uint8Array.from([1]))
      }) as unknown as typeof fetch

      const media = new InnoxiousMedia(
        { type: 'video', media: 'https://s3.example.com/clip.mp4' },
        { size: 60_000_000, uploadLimit: 50_000_000 },
      )

      await expect(media.naive()).rejects.toBeInstanceOf(MediaTooLargeError)
      await expect(media.accurate()).rejects.toBeInstanceOf(MediaTooLargeError)
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('a known size is trusted over asking the storage', async () => {
    const originalFetch = globalThis.fetch
    try {
      let calls = 0
      globalThis.fetch = (async () => {
        calls += 1
        return new Response(Uint8Array.from([1]))
      }) as unknown as typeof fetch

      const media = new InnoxiousMedia(
        { type: 'video', media: 'https://s3.example.com/clip.mp4' },
        { size: 19_000_000 },
      )

      expect((await media.naive()).media).toBe(
        'https://s3.example.com/clip.mp4',
      )
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('a higher limit, as on a self-hosted Bot API, lets the bytes through', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = sized(60_000_000)

      const media = new InnoxiousMedia(
        { type: 'video', media: 'https://s3.example.com/clip.mp4' },
        { uploadLimit: 2_000_000_000 },
      )

      expect((await media.naive()).media).toBeInstanceOf(InputFile)
      await media.dispose()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('a probed size over the limit is refused as well', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = sized(60_000_000)

      const media = new InnoxiousMedia({
        type: 'video',
        media: 'https://s3.example.com/clip.mp4',
      })

      await expect(media.naive()).rejects.toBeInstanceOf(MediaTooLargeError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('InnoxiousMedia disposal', () => {
  test('disposing after a URL delivery downloads nothing', async () => {
    const originalFetch = globalThis.fetch
    try {
      let calls = 0
      globalThis.fetch = (async () => {
        calls += 1
        return new Response(Uint8Array.from([1]))
      }) as unknown as typeof fetch

      const media = new InnoxiousMedia(
        { type: 'video', media: 'https://s3.example.com/clip.mp4' },
        { size: 1_000_000 },
      )

      expect((await media.naive()).media).toBe(
        'https://s3.example.com/clip.mp4',
      )
      // The cleanup must not be the first thing to fetch the file.
      await media.dispose()
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
