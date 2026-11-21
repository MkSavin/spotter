import type { Button, MessageContent } from '@appercot/protocol'
import {
  type DeliveryEvent,
  eventCode,
  type MediaProgress,
  renderEventTiming,
  type SpotterEvent,
} from '@spotter/transport'
import type { Context } from './context'
import { chatsRepo, eventsRepo, messagesRepo } from './db/repository'
import type { EventMessage, EventState } from './db/schema'
import {
  content,
  ignoreUnavailable,
  markdown,
  text,
  uploadPhoto,
} from './platform'

const CLIP_TIMEOUT_MS = 5 * 60_000

export const renderEvent = (event: SpotterEvent, context: Context) => {
  const source = event.source ?? context.config.source
  const label = context.catalog.objectLabel(
    source,
    event.label ?? '',
    'неизв. объект',
  )
  const camera = context.catalog.cameraLabel(
    source,
    event.camera,
    'неизв. камера',
  )
  const title = event.type === 'start' ? 'Движение!' : 'Произошло событие!'
  return `**${title}** ${markdown(eventCode(event.id))}\n${markdown(label.slice(0, 512))} ${Math.round(event.score * 1000) / 10}% | ${markdown(camera.slice(0, 512))}\n📅 ${markdown(renderEventTiming(event, context.config.timezone))}`
}

const deliver = async (
  context: Context,
  state: EventState,
  chatId: string,
  previous?: EventMessage,
) => {
  const { api, db } = context
  const { event, id, snapshotKey, clipKey, clipStatus, clipUntil } = state
  try {
    const fileId = snapshotKey
      ? previous?.photoKey === snapshotKey && previous.fileId
        ? previous.fileId
        : await uploadPhoto(context, chatId, snapshotKey)
      : null
    const buttons: Button[] = []
    if (snapshotKey && !fileId)
      buttons.push({ text: '📸 Снимок', callback: 'snapshot' })
    if (clipKey || (event.type === 'end' && event.hasClip)) {
      buttons.push({
        text:
          clipUntil && clipUntil > Date.now()
            ? (clipStatus ?? '⏳ Запрошено…')
            : clipStatus
              ? '🎬 Видео — повторить'
              : '🎬 Видео',
        callback: 'clip',
      })
    }
    const message = content({
      text: renderEvent(event, context),
      ...(fileId && { media: [{ kind: 'image', fileId }] }),
      ...(buttons.length && { buttons: [buttons] }),
    })
    if (previous) {
      if (fileId && previous.fileId !== fileId)
        messagesRepo.save(db, { ...previous, photoKey: snapshotKey, fileId })
      await api.editMessage({
        chatId,
        messageId: previous.messageId,
        content: message,
      })
    } else {
      const sent = await api.sendMessage({ chatId, content: message })
      messagesRepo.save(db, {
        eventId: id,
        chatId,
        messageId: sent.id,
        photoKey: snapshotKey,
        fileId,
      })
    }
  } catch (error) {
    if (!ignoreUnavailable(context, chatId, error)) throw error
  }
}

const fanOut = async (context: Context, state: EventState, create: boolean) => {
  const sent = new Map(
    messagesRepo
      .forEvent(context.db, state.id)
      .map((message) => [message.chatId, message]),
  )
  const results = await Promise.allSettled(
    chatsRepo.deliverable(context.db).map(async ({ id }) => {
      const previous = sent.get(id)
      if (create || previous) await deliver(context, state, id, previous)
    }),
  )
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

export const deliverEvent = async (
  delivery: DeliveryEvent,
  context: Context,
) => {
  const previous = eventsRepo.find(context.db, delivery.eventId)
  const state = eventsRepo.save(context.db, {
    ...delivery,
    event:
      previous?.event.type === 'end' && delivery.event.type !== 'end'
        ? previous.event
        : delivery.event,
  })
  if (state) await fanOut(context, state, delivery.action !== 'media')
}

export const deliverClipProgress = async (
  progress: MediaProgress,
  context: Context,
) => {
  const event = eventsRepo.find(context.db, progress.eventId)
  if (!event?.clipStatus || event.clipKey) return
  const labels = {
    fetching: '⏳ Скачивается с камеры…',
    staged: '⏳ Конвертируется…',
    failed: '🎬 Видео — повторить',
  }
  const clipStatus = labels[progress.stage]
  const clipUntil =
    progress.stage === 'failed' ? null : Date.now() + CLIP_TIMEOUT_MS
  eventsRepo.clipState(context.db, event.id, clipUntil, clipStatus)
  await fanOut(context, { ...event, clipUntil, clipStatus }, false)
}

const signedMedia = (
  context: Context,
  key: string,
  label: string,
): MessageContent =>
  content({
    ...text('Ссылка на медиа'),
    buttons: [[{ text: label, url: context.presign(key) }]],
  })

export const eventButton = async (
  context: Context,
  chatId: string,
  messageId: string,
  action: 'snapshot' | 'clip',
  principalUuid: string,
): Promise<MessageContent> => {
  const message = messagesRepo.resolve(context.db, chatId, messageId)
  const event = message && eventsRepo.find(context.db, message.eventId)
  if (!event) return text('Событие больше недоступно.')
  if (action === 'snapshot')
    return event.snapshotKey
      ? signedMedia(context, event.snapshotKey, '📸 Открыть снимок')
      : text('Снимок недоступен.')
  if (event.clipKey)
    return signedMedia(context, event.clipKey, '▶️ Открыть видео')
  if (event.clipUntil && event.clipUntil > Date.now())
    return text(event.clipStatus ?? '⏳ Видео уже запрошено.')
  if (event.event.type !== 'end' || !event.event.hasClip)
    return text('Видео недоступно.')

  const clipUntil = Date.now() + CLIP_TIMEOUT_MS
  const clipStatus = '⏳ Видео запрошено…'
  eventsRepo.clipState(context.db, event.id, clipUntil, clipStatus)
  try {
    const reply = await context.commandBus.send(
      'event.clip',
      { eventId: event.id },
      principalUuid,
    )
    if (reply.ok) {
      const state = eventsRepo.find(context.db, event.id)
      if (state?.clipStatus === clipStatus)
        await deliver(context, state, chatId, message)
      return text(clipStatus)
    }
    eventsRepo.clipState(context.db, event.id, null, null)
    return text('Не удалось запросить видео.')
  } catch (error) {
    // Keep the timeout if the reply was lost after the job was accepted.
    context.logger.warn('Could not confirm the Appercot clip request')
    throw error
  }
}
