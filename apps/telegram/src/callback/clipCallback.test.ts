import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultLogger } from 'stenograph'
import { type ClipStatus, ClipTracker } from '../clip/ClipTracker'
import type { BotContext } from '../context'
import { createDatabase, type TelegramDatabase } from '../db/client'
import { eventMessagesRepo } from '../db/repository'
import { registerClipCallback } from './clipCallback'

defaultLogger.disable()

const EVENT = '1790763801.518861-t660qg'

let db: TelegramDatabase
let directory: string
let clips: ClipTracker

type Handler = (context: BotContext) => Promise<void>

const captureHandler = (): Handler => {
  let handler: Handler | undefined
  registerClipCallback({
    callbackQuery: (_pattern: RegExp, fn: Handler) => {
      handler = fn
    },
  } as never)
  if (!handler) throw new Error('callback not registered')
  return handler
}

const tap = async (data: string, messageId = 5) => {
  const answerCallbackQuery = mock(async (_options: { text: string }) => true)
  const send = mock(async () => ({ ok: true }))
  const context = {
    db,
    clips,
    logger: defaultLogger,
    match: data.match(/^clip:(.+)$/),
    callbackQuery: { message: { chat: { id: 100 }, message_id: messageId } },
    answerCallbackQuery,
    editMessageReplyMarkup: mock(async () => true),
    commandBus: { send },
    session: { user: { recipientUuid: 'u1' } },
  }
  await captureHandler()(context as unknown as BotContext)
  return {
    answer: answerCallbackQuery.mock.calls[0]?.[0]?.text,
    requested: send.mock.calls as unknown[][],
  }
}

beforeEach(() => {
  directory = path.join(tmpdir(), `spotter-clip-${crypto.randomUUID()}`)
  db = createDatabase(path.join(directory, 'telegram.sqlite'))
  eventMessagesRepo.record(db, EVENT, [{ id: 5, chatId: '100' }])
  clips = new ClipTracker(defaultLogger, { render: () => undefined })
})

afterEach(() => {
  clips.stop()
  db.$client.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('clip processing button', () => {
  test('says where a live wait is and when a restart opens up', async () => {
    clips.begin(EVENT)
    clips.advance(EVENT, 'staged')

    const { answer, requested } = await tap('clip:wait')

    expect(answer).toContain('В очереди')
    expect(answer).toContain('5 мин')
    expect(requested).toEqual([])
  })

  test('restarts a wait nothing tracks any more', async () => {
    // What a lost repaint or a restart leaves behind: a button and no wait.
    const { requested } = await tap('clip:wait')

    expect(requested).toHaveLength(1)
    expect(requested[0]?.[1]).toEqual({ eventId: EVENT })
    expect(clips.status(EVENT)?.stage).toBe('requested')
  })

  test('restarts a wait past its deadline', async () => {
    clips.begin(EVENT)
    const expired: ClipStatus = {
      stage: 'staged',
      since: Date.now() - 600_000,
      deadline: Date.now() - 1,
    }
    clips.status = () => expired

    const { requested } = await tap('clip:wait')

    expect(requested).toHaveLength(1)
  })

  test('answers plainly when the message belongs to no known event', async () => {
    const { answer, requested } = await tap('clip:wait', 999)

    expect(answer).toBe('Событие не найдено')
    expect(requested).toEqual([])
  })

  test('the regular button still requests the clip it names', async () => {
    const { requested } = await tap(`clip:${EVENT}`)

    expect(requested[0]?.[1]).toEqual({ eventId: EVENT })
  })
})
