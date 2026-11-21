import type { MessageContent } from '@appercot/protocol'
import { satisfies } from '@spotter/transport'
import type { Context } from './context'
import { chatsRepo, requestsRepo } from './db/repository'
import type { MediaRequestState } from './db/schema'
import { content, ignoreUnavailable, text, uploadPhoto } from './platform'

export const startRequest = async (
  context: Context,
  request: Pick<
    MediaRequestState,
    'id' | 'chatId' | 'recipientUuid' | 'kind' | 'title'
  >,
  stream: string,
  payload: Record<string, unknown>,
) => {
  if (!requestsRepo.find(context.db, request.id)) {
    const { id } = await context.api.sendMessage({
      chatId: request.chatId,
      content: text(`⏳ ${request.title}`),
    })
    requestsRepo.save(context.db, {
      ...request,
      messageId: id,
      createdAt: Date.now(),
    })
  }
  await context.producer.publish(stream, { ...payload, requestId: request.id })
}

const canAccess = (context: Context, request: MediaRequestState) => {
  const chat = chatsRepo.find(context.db, request.chatId)
  return (
    chat &&
    chat.recipientUuid === request.recipientUuid &&
    satisfies(request.kind === 'probe' ? 'ADMIN' : 'USER', chat.role)
  )
}

const canRead = (context: Context, request: MediaRequestState) => {
  const chat = chatsRepo.find(context.db, request.chatId)
  return chat && !chat.blocked && canAccess(context, request)
}

export const updateRequest = async (
  context: Context,
  id: string | undefined,
  kind: MediaRequestState['kind'],
  outcome: { message: string; done: boolean; key?: string },
) => {
  if (!id) return
  const request = requestsRepo.find(context.db, id)
  if (
    !request ||
    request.kind !== kind ||
    (request.done && request.delivered) ||
    !canAccess(context, request)
  )
    return
  const result = request.done
    ? {
        message: request.outcome ?? outcome.message,
        done: true,
        key: request.key ?? outcome.key,
      }
    : outcome
  requestsRepo.update(context.db, id, {
    done: result.done,
    key: result.key,
    outcome: result.message,
    delivered: false,
  })
  if (!canRead(context, request)) return
  const { chatId, messageId } = request

  let fileId = request.fileId
  if (result.key && kind === 'frame' && !fileId) {
    fileId = await uploadPhoto(context, chatId, result.key)
    if (fileId) requestsRepo.update(context.db, id, { fileId })
  }
  if (!canRead(context, request)) return

  let delivered = true
  try {
    await context.api.editMessage({
      chatId,
      messageId,
      content: content({
        ...text(`${request.title}\n${result.message}`),
        ...(fileId && { media: [{ kind: 'image', fileId }] }),
        ...(result.key &&
          !fileId && {
            buttons: [
              [
                {
                  text: kind === 'frame' ? '📸 Снимок' : '▶️ Видео',
                  callback: `request:${id}`,
                },
              ],
            ],
          }),
      }),
    })
  } catch (error) {
    if (!ignoreUnavailable(context, chatId, error)) throw error
    delivered = !chatsRepo.find(context.db, chatId)?.blocked
  }
  requestsRepo.update(context.db, id, { delivered })
}

export const requestButton = (
  context: Context,
  id: string,
  chatId: string,
  messageId: string,
): MessageContent => {
  const request = requestsRepo.find(context.db, id)
  if (
    !request?.key ||
    request.chatId !== chatId ||
    request.messageId !== messageId ||
    !canRead(context, request)
  ) {
    return text('Медиа больше недоступно.')
  }
  return content({
    ...text(request.title),
    buttons: [[{ text: 'Открыть', url: context.presign(request.key) }]],
  })
}
