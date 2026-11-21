import { afterEach, expect, test } from 'bun:test'
import type { BotEvent, Message } from '@appercot/protocol'
import {
  CatalogCache,
  type DeliveryRecipient,
  HeartbeatRegistry,
} from '@spotter/transport'
import { S3Client } from 'bun'
import { defaultLogger } from 'stenograph'
import { createRouter } from './bot'
import type { Context } from './context'
import { createDatabase } from './db/client'
import { chatsRepo } from './db/repository'
import { deliverClipProgress, deliverEvent } from './events'
import { updateRequest } from './requests'
import * as appercotTransport from './transport'

const logger = defaultLogger.sub('appercot-test')
const opened: ReturnType<typeof createDatabase>[] = []
afterEach(() => {
  for (const db of opened.splice(0)) db.$client.close()
})

const fixture = () => {
  const db = createDatabase(':memory:')
  opened.push(db)
  const sent: Message[] = []
  const edits: Message[] = []
  const roleChanges: string[][] = []
  const rpc: string[] = []
  const uploads: string[] = []
  const published: Array<{ stream: string; payload: any }> = []
  let fail = false
  const context = {
    db,
    logger,
    config: { source: 'test', timezone: 'UTC' },
    catalog: new CatalogCache(logger),
    heartbeats: new HeartbeatRegistry(logger),
    s3: new S3Client(),
    presign: (key: string) => `https://example.test/${key}`,
    api: {
      sendMessage: async ({ chatId, content, replyTo }) => {
        if (fail) {
          fail = false
          throw new Error('disconnected')
        }
        const message = {
          id: `sent-${sent.length}`,
          chatId,
          content,
          replyTo,
          sender: 'bot',
          seq: sent.length + 1,
          status: 'processed',
          createdAt: Date.now(),
        } as const
        sent.push(message)
        return message
      },
      editMessage: async ({ chatId, messageId, content }) => {
        const message = {
          id: messageId,
          chatId,
          content,
          sender: 'bot',
          seq: 1,
          status: 'processed',
          createdAt: Date.now(),
        } as const
        edits.push(message)
        return message
      },
      setChatRoles: async ({ roles }) => {
        roleChanges.push(roles)
        return { ok: true }
      },
      answerCallback: async () => ({ ok: true }),
      uploadFile: async (chatId) => {
        uploads.push(chatId)
        return 'snapshot-file'
      },
    },
    commandBus: {
      send: async (kind) => {
        rpc.push(kind)
        return {
          requestId: 'rpc',
          ok: true,
          data: { recipientUuid: 'recipient', role: 'USER' },
        }
      },
    },
    producer: {
      publish: async (stream: string, payload: unknown) => {
        published.push({ stream, payload })
        return '1-0'
      },
    } as Context['producer'],
  } satisfies Omit<Context, 'subscriber' | 'config'> & {
    config: Pick<Context['config'], 'source' | 'timezone'>
  }
  return {
    context: context as unknown as Context,
    edits,
    sent,
    roleChanges,
    rpc,
    uploads,
    published,
    failNextSend: () => {
      fail = true
    },
  }
}

const inbound = (
  id: string,
  value: string,
  roles: string[] = [],
): Extract<BotEvent, { type: 'message' }> => ({
  type: 'message',
  chat: { id: 'chat', roles, blocked: false, createdAt: 0 },
  user: { id: 'user', username: 'alice', displayName: 'Alice' },
  message: {
    id,
    chatId: 'chat',
    sender: 'user',
    content: { text: value },
    seq: 1,
    status: 'accepted',
    createdAt: 0,
  },
})

test('replays a failed login reply without redeeming the code twice', async () => {
  const { context, failNextSend, rpc, sent, roleChanges } = fixture()
  const update = inbound('login', '/start code')
  const router = createRouter(context)
  failNextSend()
  await expect(router.receive(update)).rejects.toThrow('disconnected')
  const resumed = createRouter(context)
  await resumed.receive(update)
  await resumed.receive(update)
  expect(rpc).toEqual(['appercot.redeem'])
  expect(sent).toHaveLength(1)
  expect(roleChanges).toContainEqual(['spotter_user'])
  expect(chatsRepo.find(context.db, 'chat')).toMatchObject({
    userId: 'user',
    role: 'USER',
  })

  await resumed.receive({
    ...inbound('menu', '/me'),
    type: 'command',
    name: 'me',
  })
  expect(sent[1]?.content.text).toContain('USER')
  await resumed.receive(inbound('admin', '/event_clear', ['owner']))
  expect(rpc).toEqual(['appercot.redeem'])
  expect(sent[2]?.content.text).toContain('недоступна')
})

test('reuses the notification and uploaded snapshot on repeated delivery', async () => {
  const { context, sent, edits, uploads } = fixture()
  chatsRepo.bind(context.db, {
    id: 'chat',
    userId: 'user',
    recipientUuid: 'recipient',
    role: 'USER',
  })
  chatsRepo.bind(context.db, {
    id: 'blocked',
    userId: 'other',
    recipientUuid: 'other',
    role: 'VIEWER',
    blocked: true,
  })
  const event = {
    id: '1234.5-event',
    camera: 'garage',
    label: 'person',
    startTime: 1234,
    endTime: 1236,
    type: 'end',
    score: 0.9,
    stationary: false,
    hasClip: true,
    hasSnapshot: true,
  }
  await deliverEvent({ eventId: event.id, event, action: 'create' }, context)
  await deliverEvent({ eventId: event.id, event, action: 'create' }, context)
  await deliverEvent(
    { eventId: event.id, event, action: 'media', snapshotKey: 'snapshot.jpg' },
    context,
  )
  await deliverEvent(
    { eventId: event.id, event, action: 'media', snapshotKey: 'snapshot.jpg' },
    context,
  )
  expect(sent).toHaveLength(1)
  expect(uploads).toEqual(['chat'])
  expect(edits[2]).toMatchObject({
    id: sent[0]?.id,
    content: { media: [{ kind: 'image', fileId: 'snapshot-file' }] },
  })
})

const authorize = (context: Context) =>
  chatsRepo.bind(context.db, {
    id: 'chat',
    userId: 'user',
    recipientUuid: 'recipient',
    role: 'USER',
  })

const callback = (
  id: string,
  messageId: string,
  data: string,
): Extract<BotEvent, { type: 'callback' }> => ({
  type: 'callback',
  callbackId: id,
  messageId,
  data,
  chat: { id: 'chat', roles: ['spotter_user'], blocked: false, createdAt: 0 },
  user: { id: 'user', username: 'alice', displayName: 'Alice' },
})

const spotterEvent = {
  id: '1234.5-event',
  camera: 'garage',
  label: 'person',
  startTime: 1234,
  endTime: 1236,
  type: 'end',
  score: 0.9,
  stationary: false,
  hasClip: true,
  hasSnapshot: true,
} as const

test('correlates a camera frame and offers its signed link', async () => {
  const { context, published, sent, edits } = fixture()
  authorize(context)
  const router = createRouter(context)

  await router.receive(inbound('camera', '/camera_snapshot driveway'))

  expect(published).toHaveLength(1)
  expect(published[0]).toMatchObject({
    stream: 'spotter.camera.request.test',
    payload: { source: 'test', camera: 'driveway' },
  })
  const requestId = published[0]?.payload.requestId as string
  const progress = sent[0]
  expect(progress?.content.text).toContain('Кадр с камеры')
  if (!progress) throw new Error('Camera progress was not sent')

  await updateRequest(context, requestId, 'frame', {
    message: 'Кадр готов.',
    done: true,
    key: 'frame.jpg',
  })
  expect(edits.at(-1)).toMatchObject({
    id: progress?.id,
    content: { media: [{ kind: 'image', fileId: 'snapshot-file' }] },
  })

  await router.receive(
    callback('frame-link', progress.id, `request:${requestId}`),
  )
  expect(sent.at(-1)?.content.buttons?.[0]?.[0]).toEqual({
    text: 'Открыть',
    url: 'https://example.test/frame.jpg',
  })
})

test('tracks a timelapse from acceptance to its signed video', async () => {
  const { context, published, sent, edits } = fixture()
  authorize(context)
  const router = createRouter(context)

  await router.receive(inbound('timelapse', '/timelapse driveway сегодня'))
  const publication = published[0]
  expect(publication).toMatchObject({
    stream: 'spotter.timelapse.request.test',
    payload: { source: 'test', camera: 'driveway', speed: 'timelapse' },
  })
  const requestId = publication?.payload.requestId as string

  await router.receive(inbound('timelapse-status', '/timelapse_status'))
  expect(sent.at(-1)?.content.text).toContain('Таймлапс')

  await updateRequest(context, requestId, 'timelapse', {
    message: 'Собирается 2 мин.',
    done: false,
  })
  await updateRequest(context, requestId, 'timelapse', {
    message: 'Экспорт готов.',
    done: true,
    key: 'timelapse.mp4',
  })
  expect(edits.at(-1)?.content.text).toContain('Экспорт готов')

  await router.receive(inbound('timelapse-done', '/timelapse_status'))
  expect(sent.at(-1)?.content.text).toContain('Нет запущенных')

  const requestMessage = sent[0]
  if (!requestMessage) throw new Error('Timelapse request was not sent')
  await router.receive(
    callback('timelapse-link', requestMessage.id, `request:${requestId}`),
  )
  expect(sent.at(-1)?.content.buttons?.[0]?.[0]).toEqual({
    text: 'Открыть',
    url: 'https://example.test/timelapse.mp4',
  })
})

test('requests a clip once and gives a fresh link when it is ready', async () => {
  const { context, sent, rpc, edits } = fixture()
  authorize(context)
  const router = createRouter(context)
  await deliverEvent(
    { eventId: spotterEvent.id, event: spotterEvent, action: 'create' },
    context,
  )
  const message = sent[0]
  if (!message) throw new Error('Event was not sent')

  await router.receive(callback('clip', message.id, 'clip'))
  await router.receive(callback('clip', message.id, 'clip'))
  expect(rpc).toEqual(['event.clip'])

  await deliverClipProgress(
    { eventId: spotterEvent.id, stage: 'fetching' },
    context,
  )
  expect(edits.at(-1)?.content.buttons?.[0]?.[0]).toMatchObject({
    text: '⏳ Скачивается с камеры…',
  })

  await deliverEvent(
    {
      eventId: spotterEvent.id,
      event: spotterEvent,
      action: 'media',
      clipKey: 'clip.mp4',
    },
    context,
  )
  await router.receive(callback('clip-ready', message.id, 'clip'))
  expect(sent.at(-1)?.content.buttons?.[0]?.[0]).toEqual({
    text: '▶️ Открыть видео',
    url: 'https://example.test/clip.mp4',
  })
})

test('stops delivery while blocked and resumes after unblock', async () => {
  const { context, sent } = fixture()
  authorize(context)
  const router = createRouter(context)
  const lifecycle = (type: 'bot_blocked' | 'bot_unblocked'): BotEvent => ({
    type,
    chat: {
      id: 'chat',
      roles: ['spotter_user'],
      blocked: type === 'bot_blocked',
      createdAt: 0,
    },
    user: { id: 'user', username: 'alice', displayName: 'Alice' },
  })

  await router.receive(lifecycle('bot_blocked'))
  await deliverEvent(
    { eventId: spotterEvent.id, event: spotterEvent, action: 'create' },
    context,
  )
  expect(sent).toHaveLength(0)

  await router.receive(lifecycle('bot_unblocked'))
  await deliverEvent(
    { eventId: spotterEvent.id, event: spotterEvent, action: 'update' },
    context,
  )
  expect(sent).toHaveLength(1)
})

test('synchronizes role updates without signing a logged-out chat back in', async () => {
  const { context, roleChanges } = fixture()
  authorize(context)
  chatsRepo.bind(context.db, {
    id: 'logged-out',
    userId: 'other',
    recipientUuid: 'recipient',
    role: null,
  })
  const updateRecipient = (
    appercotTransport as unknown as {
      updateRecipient?: (
        delivery: DeliveryRecipient,
        context: Context,
      ) => Promise<void>
    }
  ).updateRecipient
  expect(updateRecipient).toBeFunction()
  if (!updateRecipient) throw new Error('Recipient handler is missing')

  await updateRecipient(
    { recipientUuid: 'recipient', role: 'ADMIN', action: 'update' },
    context,
  )
  expect(chatsRepo.find(context.db, 'chat')?.role).toBe('ADMIN')
  expect(chatsRepo.find(context.db, 'logged-out')?.role).toBeNull()
  expect(roleChanges).toEqual([['spotter_admin']])

  await updateRecipient(
    { recipientUuid: 'recipient', role: null, action: 'revoke' },
    context,
  )
  expect(chatsRepo.find(context.db, 'chat')?.role).toBeNull()
  expect(chatsRepo.find(context.db, 'logged-out')?.role).toBeNull()
  expect(roleChanges.at(-1)).toEqual([])
})

const blockedEvent = (type: 'bot_blocked' | 'bot_unblocked'): BotEvent => ({
  type,
  chat: {
    id: 'chat',
    roles: ['spotter_user'],
    blocked: type === 'bot_blocked',
    createdAt: 0,
  },
  user: { id: 'user', username: 'alice', displayName: 'Alice' },
})

test('delivers a frame that finished while the bot was blocked', async () => {
  const { context, sent, edits, published } = fixture()
  authorize(context)
  const router = createRouter(context)
  await router.receive(inbound('blocked-frame', '/camera_snapshot driveway'))
  const progress = sent[0]
  if (!progress) throw new Error('Camera progress was not sent')
  const requestId = published[0]?.payload.requestId as string
  await router.receive(blockedEvent('bot_blocked'))

  await updateRequest(context, requestId, 'frame', {
    message: 'Кадр готов.',
    done: true,
    key: 'deferred.jpg',
  })
  expect(edits).toHaveLength(0)

  await router.receive(blockedEvent('bot_unblocked'))
  expect(edits.at(-1)).toMatchObject({
    id: progress.id,
    content: {
      text: expect.stringContaining('Кадр готов'),
      media: [{ kind: 'image', fileId: 'snapshot-file' }],
    },
  })
})

test('delivers a terminal failure after the bot is unblocked', async () => {
  const { context, sent, edits, published } = fixture()
  authorize(context)
  const router = createRouter(context)
  await router.receive(
    inbound('blocked-timelapse', '/timelapse driveway сегодня'),
  )
  const progress = sent[0]
  if (!progress) throw new Error('Timelapse request was not sent')
  const requestId = published[0]?.payload.requestId as string
  await router.receive(blockedEvent('bot_blocked'))

  await updateRequest(context, requestId, 'timelapse', {
    message: 'Нет записей за этот период.',
    done: true,
  })
  await router.receive(blockedEvent('bot_unblocked'))

  expect(edits.at(-1)).toMatchObject({
    id: progress.id,
    content: { text: expect.stringContaining('Нет записей за этот период') },
  })
})
