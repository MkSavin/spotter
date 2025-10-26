import { test, expect, describe } from 'bun:test'
import { attachInnoxious } from './attachInnoxious'

describe('attachInnoxious', () => {
  test('attachInnoxious exposes innoxious methods', () => {
    const api: any = {
      sendMediaGroup: async () => {},
      sendPhoto: async () => {},
      sendDocument: async () => {},
      sendVideo: async () => {},
    }

    attachInnoxious(api)

    expect(api.innoxious).toBeDefined()
    expect(typeof api.innoxious.sendMediaGroup).toBe('function')
    expect(typeof api.innoxious.sendPhoto).toBe('function')
    expect(typeof api.innoxious.sendDocument).toBe('function')
    expect(typeof api.innoxious.sendVideo).toBe('function')
  })

  test('sendMediaGroup: retries naive twice then accurate succeeds', async () => {
    const calls: any[] = []

    const api: any = {
      sendMediaGroup: async (chatId: any, media: any) => {
        calls.push({ method: 'sendMediaGroup', chatId, media })
        // simulate throw for naive payloads and succeed for accurate
        if (JSON.stringify(media).includes('naive')) {
          throw new Error('naive fail')
        }
        return 'ok'
      },
      sendPhoto: async () => {},
      sendDocument: async () => {},
      sendVideo: async () => {},
    }

    attachInnoxious(api)

    const media = {
      naive: async () => [{ type: 'photo', media: 'naive' }],
      accurate: async () => [{ type: 'photo', media: 'accurate' }],
    }

    const res = await api.innoxious.sendMediaGroup(1, media, {})

    expect(res).toBe('ok')
    // two naive attempts then one accurate
    expect(calls.length).toBe(3)
    expect(calls[0].method).toBe('sendMediaGroup')
    expect(calls[2].media[0].media).toBe('accurate')
  })

  test('sendPhoto: falls back to accurate when naive fails', async () => {
    const calls: any[] = []

    const api: any = {
      sendPhoto: async (chatId: any, photo: any) => {
        calls.push({ method: 'sendPhoto', chatId, photo })
        if (photo === 'naive') throw new Error('naive fail')
        return 'sent'
      },
      sendMediaGroup: async () => {},
      sendDocument: async () => {},
      sendVideo: async () => {},
    }

    attachInnoxious(api)

    const media = {
      naive: async () => ({ type: 'photo', media: 'naive' }),
      accurate: async () => ({ type: 'photo', media: 'accurate-buffer' }),
    }

    const res = await api.innoxious.sendPhoto(5, media, {})

    expect(res).toBe('sent')
    expect(calls.length).toBe(3)
    // last call should use accurate media
    expect(calls[2].photo).toBe('accurate-buffer')
  })

  test('sendVideo/sendDocument propagate error when both strategies fail', async () => {
    const api: any = {
      sendVideo: async () => {
        throw new Error('always fail')
      },
      sendDocument: async () => {
        throw new Error('always fail')
      },
      sendPhoto: async () => {},
      sendMediaGroup: async () => {},
    }

    attachInnoxious(api)

    const badMedia = {
      naive: async () => ({ type: 'video', media: 'naive' }),
      accurate: async () => ({ type: 'video', media: 'accurate' }),
    }

    await expect(api.innoxious.sendVideo(1, badMedia, {})).rejects.toThrow()
    await expect(api.innoxious.sendDocument(1, badMedia, {})).rejects.toThrow()
  })

  test('malformed media causes rejection', async () => {
    const api: any = {
      sendPhoto: async (chatId: any, photo: any) => {
        if (!photo) throw new Error('bad media')
      },
      sendMediaGroup: async (chatId: any, media: any) => {
        if (!media) throw new Error('bad media')
      },
      sendDocument: async () => {},
      sendVideo: async () => {},
    }

    attachInnoxious(api)

    const malformed = {
      naive: async () => null,
      accurate: async () => null,
    }

    await expect(
      api.innoxious.sendPhoto(1, malformed as any, {}),
    ).rejects.toThrow()
    await expect(
      api.innoxious.sendMediaGroup(1, malformed as any, {}),
    ).rejects.toThrow()
  })
})
