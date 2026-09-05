import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DeliveryEvent, SpotterEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { createDatabase, type TelegramDatabase } from '../../db/client'
import { eventMessagesRepo, tgChatsRepo } from '../../db/repository'
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

const makeContext = () => {
  const editMessageText = mock(async () => undefined)
  const editMessageMedia = mock(async () => undefined)
  const sendMessage = mock(async () => ({ message_id: 7 }))

  return {
    db,
    logger: {
      debug: mock(() => undefined),
      warn: mock(() => undefined),
      sub: () => ({ debug: mock(() => undefined) }),
    },
    config: { source: 'frigate', presignExpiry: 60, timezone: 'UTC' },
    catalog: {
      objectLabel: (_s: string, code: string) => code,
      cameraLabel: (_s: string, code: string) => code,
    },
    clips: { fail: mock(() => undefined), complete: mock(() => undefined) },
    s3: { presign: () => 'https://example.test/x.jpg' },
    bot: {
      api: {
        editMessageText,
        editMessageMedia,
        sendMessage,
        innoxious: { sendPhoto: mock(async () => ({ message_id: 8 })) },
      },
    },
    editMessageText,
    editMessageMedia,
  } as unknown as TransportContext & {
    editMessageText: ReturnType<typeof mock>
    editMessageMedia: ReturnType<typeof mock>
  }
}

beforeEach(() => {
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

  test('an empty delivery says both: no snapshot and no clip', async () => {
    const context = makeContext()

    await deliveryEventAction(
      { eventId: 'cam-htriyg-1', event: event('end'), action: 'media' },
      context,
    )

    const text = context.editMessageText.mock.calls[0][2] as string
    expect(text).toContain('🙈 Без снимка')
    expect(text).toContain('🎞️ Без видео')
    cleanup()
  })
})
