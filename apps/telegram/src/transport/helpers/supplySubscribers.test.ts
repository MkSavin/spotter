import { describe, expect, test } from 'bun:test'
import type { EventMessage } from '../../db/schema'
import { timeout } from '../../helpers/timeout'
import { supplySubscribedChats } from './supplySubscribers'

const chatIds = ['101', '102', '103']

const messages: EventMessage[] = [
  {
    chatId: '100',
    id: 100,
  },
  {
    chatId: '102',
    id: 100,
  },
  {
    chatId: '103',
    id: 105,
  },
]

const supply = (
  subscribedChatIds: string[],
  suppliedMessages: EventMessage[],
) =>
  supplySubscribedChats(subscribedChatIds, suppliedMessages, {
    create: (chatId) => timeout(100).then(() => ({ chatId, id: -1 })),
    update: (message) => timeout(100).then(() => message),
    remove: (message) => timeout(100).then(() => message),
  })

describe('Subscribers branching logic', () => {
  test('To correctly execute branching logic correctly', async () => {
    const { supplied, failed } = await supply(chatIds, messages)

    expect(failed).toBe(false)
    expect(supplied).toBeArrayOfSize(4)

    expect(
      supplied.filter((message) => message.action === 'create'),
    ).toBeArrayOfSize(1)
    expect(
      supplied.filter((message) => message.action === 'update'),
    ).toBeArrayOfSize(2)
    expect(
      supplied.filter((message) => message.action === 'remove'),
    ).toBeArrayOfSize(1)

    supplied.forEach((message) => {
      expect(message.action).toBeOneOf(['create', 'update', 'remove'])
      expect(message.data).toEqual({ chatId: message.chatId, id: message.id })
    })
  })

  test('To correctly execute branching logic on empty chats', async () => {
    const { supplied } = await supply([], messages)

    expect(
      supplied.filter((message) => message.action === 'create'),
    ).toBeArrayOfSize(0)
    expect(
      supplied.filter((message) => message.action === 'update'),
    ).toBeArrayOfSize(0)
    expect(
      supplied.filter((message) => message.action === 'remove'),
    ).toBeArrayOfSize(3)
  })

  test('To correctly execute branching logic on empty messages', async () => {
    const { supplied } = await supply(chatIds, [])

    expect(
      supplied.filter((message) => message.action === 'create'),
    ).toBeArrayOfSize(3)
    expect(
      supplied.filter((message) => message.action === 'update'),
    ).toBeArrayOfSize(0)
    expect(
      supplied.filter((message) => message.action === 'remove'),
    ).toBeArrayOfSize(0)
  })

  test('To correctly execute branching logic on empty chats and messages', async () => {
    const { supplied } = await supply([], [])

    expect(
      supplied.filter((message) => message.action === 'create'),
    ).toBeArrayOfSize(0)
    expect(
      supplied.filter((message) => message.action === 'update'),
    ).toBeArrayOfSize(0)
    expect(
      supplied.filter((message) => message.action === 'remove'),
    ).toBeArrayOfSize(0)
  })

  test('A failing chat is reported without dropping the successful ones', async () => {
    const { supplied, failed } = await supplySubscribedChats(
      chatIds,
      messages,
      {
        create: (chatId) =>
          chatId === '101'
            ? Promise.reject(new Error('boom'))
            : timeout(50).then(() => ({ chatId, id: -1 })),
        update: (message) => timeout(50).then(() => message),
        remove: (message) => timeout(50).then(() => message),
      },
    )

    expect(failed).toBe(true)
    // 4 fan-out actions, one create rejected → 3 fulfilled survive.
    expect(supplied).toBeArrayOfSize(3)
    expect(supplied.some((message) => message.chatId === '101')).toBe(false)
  })
})
