import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DeliveryEvent, SpotterEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { createDatabase, type TelegramDatabase } from '../../db/client'
import {
  eventClipPartsRepo,
  eventMessagesRepo,
  tgChatsRepo,
} from '../../db/repository'
import type { InnoxiousMedia } from '../../extension/innoxious/InnoxiousMedia'
import { deliveryEventAction } from './deliveryEventAction'

let db: TelegramDatabase
let directory: string

const event = (type: 'start' | 'end', hasClip = false): SpotterEvent => ({
  id: 'cam-htriyg-1',
  source: 'frigate',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: type === 'end' ? 1700000010 : null,
  score: 0.9,
  stationary: false,
  hasClip,
  hasSnapshot: false,
  type,
})

/** What the PWA announces in its heartbeat; empty means no web app is up. */
let pwaServices: {
  service: string
  online: boolean
  details?: { url: string }
}[] = []

const makeContext = () => {
  const editMessageText = mock(async () => undefined)
  const editMessageCaption = mock(async () => undefined)
  const editMessageMedia = mock(async (..._args: unknown[]) => undefined)
  const sendMessage = mock(async () => ({ message_id: 7 }))
  let nextId = 20
  const sendVideo = mock(async () => ({ message_id: nextId++ }))

  return {
    db,
    logger: {
      debug: mock(() => undefined),
      warn: mock(() => undefined),
      sub: () => ({ debug: mock(() => undefined) }),
    },
    config: {
      source: 'frigate',
      presignExpiry: 60,
      timezone: 'UTC',
      telegram: { uploadLimit: 50_000_000 },
    },
    heartbeats: { all: () => pwaServices },
    catalog: {
      objectLabel: (_s: string, code: string) => code,
      cameraLabel: (_s: string, code: string) => code,
    },
    clips: { fail: mock(() => undefined), complete: mock(() => undefined) },
    // A path, not a URL: a URL would be probed for its size over the network.
    s3: { presign: (key: string) => `/presigned/${key}` },
    bot: {
      api: {
        editMessageText,
        editMessageCaption,
        sendMessage,
        innoxious: {
          sendPhoto: mock(async () => ({ message_id: 8 })),
          sendVideo,
          editMessageMedia: async (
            chatId: string,
            messageId: number,
            media: InnoxiousMedia<{ type: 'photo'; media: string }>,
            other: unknown,
          ) => editMessageMedia(chatId, messageId, await media.naive(), other),
        },
      },
    },
    editMessageText,
    editMessageCaption,
    editMessageMedia,
    sendVideo,
  } as unknown as TransportContext & {
    editMessageText: ReturnType<typeof mock>
    editMessageCaption: ReturnType<typeof mock>
    editMessageMedia: ReturnType<typeof mock>
    sendVideo: ReturnType<typeof mock>
  }
}

beforeEach(() => {
  pwaServices = []
  directory = path.join(tmpdir(), `spotter-delivery-${crypto.randomUUID()}`)
  db = createDatabase(path.join(directory, 'telegram.sqlite'))
  tgChatsRepo.upsert(db, '100')
  eventMessagesRepo.record(db, 'cam-htriyg-1', [{ id: 5, chatId: '100' }])
})

const cleanup = () => {
  db.$client.close()
  rmSync(directory, { recursive: true, force: true })
}

describe('deliveryEventAction media with nothing attached', () => {
  test('marks the event as having no snapshot', async () => {
    const context = makeContext()
    const delivery: DeliveryEvent = {
      eventId: 'cam-htriyg-1',
      event: event('end'),
      action: 'media',
    }

    await deliveryEventAction(delivery, context)

    const text = context.editMessageText.mock.calls[0][2] as string
    expect(text).toContain('🙈 Без снимка')
    cleanup()
  })

  test('still reports the clip failure to the tracker', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('end'), action: 'media' },
      context,
    )

    expect(context.clips.fail).toHaveBeenCalled()
    cleanup()
  })

  test('an ended event says its snapshot is on the way', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('end'), action: 'update' },
      context,
    )

    const text = context.editMessageText.mock.calls[0][2] as string
    expect(text).toContain('📸 В обработке')
    expect(text).not.toContain('Без снимка')
    cleanup()
  })

  test('a start event carries no indicator yet', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('start'), action: 'create' },
      context,
    )

    const text = context.editMessageText.mock.calls[0][2] as string
    expect(text).not.toContain('В обработке')
    expect(text).not.toContain('Без снимка')
    cleanup()
  })

  test('a delivered snapshot replaces the marker via media edit', async () => {
    const context = makeContext()

    await deliveryEventAction(
      {
        eventId: 'cam-htriyg-1',
        event: event('end'),
        action: 'media',
        snapshotKey: 'event-media/snap.jpg',
      },
      context,
    )

    // Media path edits the media, not the text: the caption carries no marker.
    expect(context.editMessageMedia).toHaveBeenCalled()
    expect(context.editMessageText).not.toHaveBeenCalled()
    cleanup()
  })
})

describe('deliveryEventAction clip marker', () => {
  test('an ended event with no clip says so instead of just dropping the button', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('end'), action: 'update' },
      context,
    )

    const [, , text, options] = context.editMessageText.mock.calls[0]
    expect(text as string).toContain('🎞️ Без видео')
    // No button, and now the text explains why rather than looking broken.
    expect((options as { reply_markup?: unknown }).reply_markup).toBeUndefined()
    cleanup()
  })

  test('an ended event advertising a clip gets the button and no marker', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('end', true), action: 'update' },
      context,
    )

    const [, , text, options] = context.editMessageText.mock.calls[0]
    expect(text as string).not.toContain('Без видео')
    expect((options as { reply_markup?: unknown }).reply_markup).toBeDefined()
    cleanup()
  })

  test('a running event stays silent about the clip', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('start'), action: 'create' },
      context,
    )

    const text = context.editMessageText.mock.calls[0][2] as string
    expect(text).not.toContain('Без видео')
    cleanup()
  })

  test('an arriving clip clears the marker it was delivered against', async () => {
    const context = makeContext()

    await deliveryEventAction(
      {
        eventId: 'cam-htriyg-1',
        event: event('end'),
        action: 'media',
        clipKey: 'event-media/clip.mp4',
      },
      context,
    )

    const media = context.editMessageMedia.mock.calls[0][2] as {
      caption: string
    }
    expect(media.caption).not.toContain('Без видео')
    cleanup()
  })

  test('a snapshot keeps the marker: it says nothing about the clip', async () => {
    const context = makeContext()

    await deliveryEventAction(
      {
        eventId: 'cam-htriyg-1',
        event: event('end'),
        action: 'media',
        snapshotKey: 'event-media/snap.jpg',
      },
      context,
    )

    const media = context.editMessageMedia.mock.calls[0][2] as {
      caption: string
    }
    expect(media.caption).toContain('🎞️ Без видео')
    cleanup()
  })

  test('an empty delivery says it once: neither snapshot nor clip', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('end'), action: 'media' },
      context,
    )

    const text = context.editMessageText.mock.calls[0][2] as string
    expect(text).toContain('🙈 Без снимка и видео')
    cleanup()
  })
})

describe('deliveryEventAction clip parts', () => {
  const delivery: DeliveryEvent = {
    eventId: 'cam-htriyg-1',
    event: event('end', true),
    action: 'media',
    clipKey: 'event-media/clip.mp4',
    clipParts: [
      'event-media/clip.part1.mp4',
      'event-media/clip.part2.mp4',
      'event-media/clip.part3.mp4',
    ],
  }

  const sentCaptions = (context: ReturnType<typeof makeContext>) =>
    context.sendVideo.mock.calls.map(
      (call) => (call[2] as { caption: string }).caption,
    )

  test('part 1 takes the message, the rest follow as replies in order', async () => {
    const context = makeContext()

    await deliveryEventAction(delivery, context)

    const [, messageId, main] = context.editMessageMedia.mock.calls[0] as [
      string,
      number,
      { media: unknown; caption: string },
    ]
    expect(messageId).toBe(5)
    expect(main.caption).toContain('Часть 1 из 3')

    expect(sentCaptions(context)).toEqual([
      expect.stringContaining('Часть 2 из 3'),
      expect.stringContaining('Часть 3 из 3'),
    ])
    for (const call of context.sendVideo.mock.calls) {
      expect(call[2]).toMatchObject({ reply_parameters: { message_id: 5 } })
    }
    cleanup()
  })

  test('a retry does not send a part a chat already has', async () => {
    const context = makeContext()
    eventClipPartsRepo.record(db, 'cam-htriyg-1', 2, [
      { id: 11, chatId: '100' },
    ])

    await deliveryEventAction(delivery, context)

    expect(sentCaptions(context)).toEqual([
      expect.stringContaining('Часть 3 из 3'),
    ])
    cleanup()
  })

  test('a failed part stops the later ones so the retry keeps the order', async () => {
    const context = makeContext()
    context.sendVideo.mockImplementationOnce(async () => {
      throw new Error('400: Bad Request')
    })

    await expect(deliveryEventAction(delivery, context)).rejects.toThrow(
      'clip part 2 of 3',
    )

    expect(context.sendVideo).toHaveBeenCalledTimes(1)
    expect(eventClipPartsRepo.find(db, 'cam-htriyg-1', 3)).toEqual([])
    cleanup()
  })

  test('an uncut clip is delivered whole, with no part mark', async () => {
    const context = makeContext()

    await deliveryEventAction({ ...delivery, clipParts: undefined }, context)

    const main = context.editMessageMedia.mock.calls[0][2] as {
      caption: string
    }
    expect(main.caption).not.toContain('Часть')
    expect(context.sendVideo).not.toHaveBeenCalled()
    cleanup()
  })
})

describe('deliveryEventAction clip over the upload limit', () => {
  const delivery: DeliveryEvent = {
    eventId: 'cam-htriyg-1',
    event: event('end', true),
    action: 'media',
    clipKey: 'event-media/clip.mp4',
    clipBytes: 60_000_000,
  }

  const online = () => {
    pwaServices = [
      {
        service: 'pwa',
        online: true,
        details: { url: 'https://spotter.example.com/' },
      },
    ]
  }

  test('is not uploaded: the message says so and links to the web app', async () => {
    online()
    const context = makeContext()

    await deliveryEventAction(delivery, context)

    // No video edit was even attempted: the size came with the contract.
    expect(context.editMessageMedia).not.toHaveBeenCalled()
    const [, , options] = context.editMessageCaption.mock.calls[0] as [
      string,
      number,
      {
        caption: string
        reply_markup: { inline_keyboard: { url?: string }[][] }
      },
    ]
    expect(options.caption).toContain('Видео не влезает в Telegram')
    expect(options.reply_markup.inline_keyboard[0]?.[0]?.url).toBe(
      'https://spotter.example.com/event/cam-htriyg-1',
    )
    cleanup()
  })

  test('without a web app the message only says why there is no video', async () => {
    const context = makeContext()

    await deliveryEventAction(delivery, context)

    const [, , options] = context.editMessageCaption.mock.calls[0] as [
      string,
      number,
      { caption: string; reply_markup?: unknown },
    ]
    expect(options.caption).toContain('Видео не влезает в Telegram')
    expect(options.reply_markup).toBeUndefined()
    cleanup()
  })

  test('a snapshot in the same delivery is still attached', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { ...delivery, snapshotKey: 'event-media/snap.jpg' },
      context,
    )

    const [, , media] = context.editMessageMedia.mock.calls[0] as [
      string,
      number,
      { type: string; caption: string },
    ]
    expect(media.type).toBe('photo')
    expect(media.caption).toContain('Видео не влезает в Telegram')
    cleanup()
  })

  test('a text message with no caption is edited as text', async () => {
    const context = makeContext()
    context.editMessageCaption.mockImplementationOnce(async () => {
      throw new Error('400: there is no caption in the message to edit')
    })

    await deliveryEventAction(delivery, context)

    expect(context.editMessageText).toHaveBeenCalledTimes(1)
    cleanup()
  })

  test('a cut clip whose first part fits is delivered, linking to the whole', async () => {
    online()
    const context = makeContext()

    await deliveryEventAction(
      {
        ...delivery,
        clipParts: ['event-media/clip.part1.mp4', 'event-media/clip.part2.mp4'],
        clipPartBytes: [40_000_000, 20_000_000],
      },
      context,
    )

    const [, , main, options] = context.editMessageMedia.mock.calls[0] as [
      string,
      number,
      { type: string },
      { reply_markup: { inline_keyboard: { url?: string }[][] } },
    ]
    expect(main.type).toBe('video')
    expect(options.reply_markup.inline_keyboard[0]?.[0]?.url).toBe(
      'https://spotter.example.com/event/cam-htriyg-1',
    )
    expect(context.sendVideo).toHaveBeenCalledTimes(1)
    cleanup()
  })

  test('a self-hosted Bot API takes the whole clip', async () => {
    const context = makeContext()
    ;(context.config.telegram as { uploadLimit: number }).uploadLimit =
      2_000_000_000

    await deliveryEventAction(delivery, context)

    const [, , main] = context.editMessageMedia.mock.calls[0] as [
      string,
      number,
      { type: string },
    ]
    expect(main.type).toBe('video')
    expect(context.editMessageCaption).not.toHaveBeenCalled()
    cleanup()
  })
})

describe('deliveryEventAction oversized edge cases', () => {
  const base: DeliveryEvent = {
    eventId: 'cam-htriyg-1',
    event: event('end', true),
    action: 'media',
    clipKey: 'event-media/clip.mp4',
  }

  test('any part over the upload limit keeps the whole clip off Telegram', async () => {
    const context = makeContext()

    await deliveryEventAction(
      {
        ...base,
        clipParts: ['event-media/clip.part1.mp4', 'event-media/clip.part2.mp4'],
        // Part 1 would fit; sending it alone is half a clip, not a clip.
        clipPartBytes: [40_000_000, 60_000_000],
      },
      context,
    )

    expect(context.editMessageMedia).not.toHaveBeenCalled()
    expect(context.sendVideo).not.toHaveBeenCalled()
    expect(context.editMessageCaption).toHaveBeenCalledTimes(1)
    cleanup()
  })

  test('sizes that do not line up with the parts are not trusted', async () => {
    const context = makeContext()

    await deliveryEventAction(
      {
        ...base,
        clipParts: ['event-media/clip.part1.mp4', 'event-media/clip.part2.mp4'],
        // Whole-clip size only: says nothing about either part.
        clipBytes: 90_000_000,
      },
      context,
    )

    const [, , main] = context.editMessageMedia.mock.calls[0] as [
      string,
      number,
      { type: string },
    ]
    expect(main.type).toBe('video')
    cleanup()
  })

  test('a redelivery that changes nothing is not a failure', async () => {
    const context = makeContext()
    context.editMessageCaption.mockImplementationOnce(async () => {
      throw new Error('400: Bad Request: message is not modified')
    })

    await deliveryEventAction({ ...base, clipBytes: 60_000_000 }, context)

    expect(context.editMessageText).not.toHaveBeenCalled()
    cleanup()
  })

  test('a message that never had a photo keeps saying so', async () => {
    const context = makeContext()

    await deliveryEventAction(
      {
        ...base,
        event: { ...event('end', true), hasSnapshot: false },
        clipBytes: 60_000_000,
      },
      context,
    )

    const [, , options] = context.editMessageCaption.mock.calls[0] as [
      string,
      number,
      { caption: string },
    ]
    expect(options.caption).toContain('Без снимка')
    expect(options.caption).toContain('Видео не влезает в Telegram')
    cleanup()
  })

  test('a muted chat is left alone', async () => {
    const context = makeContext()
    tgChatsRepo.setMuted(db, '100', new Date(Date.now() + 60_000))

    await deliveryEventAction({ ...base, clipBytes: 60_000_000 }, context)

    expect(context.editMessageCaption).not.toHaveBeenCalled()
    cleanup()
  })
})
