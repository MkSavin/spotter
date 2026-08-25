import { beforeEach, describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import { createDatabase, type TelegramDatabase } from '../../db/client'
import { eventMessagesRepo, tgChatsRepo } from '../../db/repository'
import { actualizeSentMessages } from './actualizeSentMessages'

const eventId = '1787642445.90943-oemp2q'

type SentCall = { chatId: string; text: string }

/** Bot stub whose sends and edits can each be made to fail on demand. */
const makeContext = (
  db: TelegramDatabase,
  failSends: boolean,
  failEdits = false,
) => {
  const sent: SentCall[] = []
  const edited: SentCall[] = []
  let nextMessageId = 100

  const bot = {
    api: {
      sendMessage: async (chatId: string, text: string) => {
        if (failSends) throw new Error('Bad Gateway')
        sent.push({ chatId, text })
        nextMessageId += 1
        return { message_id: nextMessageId }
      },
      editMessageText: async (chatId: string, _id: number, text: string) => {
        if (failEdits) throw new Error('Bad Gateway')
        edited.push({ chatId, text })
        return true
      },
    },
  }

  return { context: { bot, db, logger: defaultLogger } as never, sent, edited }
}

describe('actualizeSentMessages', () => {
  let db: TelegramDatabase

  beforeEach(() => {
    db = createDatabase(':memory:')
    tgChatsRepo.upsert(db, 'chat-1')
  })

  test('a failed send is not recorded and does not wipe existing state', async () => {
    const { context } = makeContext(db, true)

    await expect(
      actualizeSentMessages(eventId, [], 'text', context),
    ).rejects.toThrow(/delivery incomplete/)

    expect(eventMessagesRepo.count(db, eventId)).toBe(0)
  })

  test('does not re-send to a chat that already has the message', async () => {
    // First delivery lands and is recorded.
    const first = makeContext(db, false)
    await actualizeSentMessages(eventId, [], 'text', first.context)

    expect(first.sent).toHaveLength(1)
    const stored = eventMessagesRepo.find(db, eventId)
    expect(stored).toHaveLength(1)

    // Second delivery (the retry / next update) must EDIT, never send again —
    // this is the duplicate-message regression from event oemp2q.
    const second = makeContext(db, false)
    await actualizeSentMessages(eventId, stored, 'updated', second.context)

    expect(second.sent).toHaveLength(0)
    expect(second.edited).toEqual([{ chatId: 'chat-1', text: 'updated' }])
    expect(eventMessagesRepo.count(db, eventId)).toBe(1)
  })

  test('a fully failed delivery keeps the earlier message recorded', async () => {
    const first = makeContext(db, false)
    await actualizeSentMessages(eventId, [], 'text', first.context)
    const stored = eventMessagesRepo.find(db, eventId)
    expect(stored).toHaveLength(1)

    // Telegram goes down: the edit for the known chat fails too, so nothing is
    // supplied. The stored message id must still survive — wiping it here is
    // what made the retry send a duplicate (event oemp2q).
    const second = makeContext(db, true, true)

    await expect(
      actualizeSentMessages(eventId, stored, 'text', second.context),
    ).rejects.toThrow(/delivery incomplete/)

    expect(eventMessagesRepo.find(db, eventId)).toEqual(stored)

    // And the recovery delivery edits rather than sending a second message.
    const third = makeContext(db, false)
    await actualizeSentMessages(
      eventId,
      eventMessagesRepo.find(db, eventId),
      'recovered',
      third.context,
    )

    expect(third.sent).toHaveLength(0)
    expect(third.edited).toHaveLength(1)
  })
})
