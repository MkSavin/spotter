import { BotApiError } from '@appercot/chat'
import type { BotEvent } from '@appercot/protocol'
import { CommandThrottle, satisfies } from '@spotter/transport'
import { commands } from './commands'
import type { Context } from './context'
import {
  chatsRepo,
  interactionsRepo,
  messagesRepo,
  requestsRepo,
} from './db/repository'
import { eventButton } from './events'
import {
  content,
  ignoreUnavailable,
  menuRoles,
  parseCommand,
  syncRole,
  text,
} from './platform'
import { requestButton, updateRequest } from './requests'

export const createRouter = (context: Context) => {
  const { db, api } = context
  const queue = new Map<string, Promise<void>>()
  const throttle = new CommandThrottle()
  let stopping = false

  const handle = async (event: BotEvent) => {
    const { id: chatId, roles } = event.chat
    if (roles.includes('guest')) return
    if (event.type === 'bot_blocked' || event.type === 'bot_unblocked') {
      const blocked = event.type === 'bot_blocked'
      chatsRepo.update(db, chatId, { blocked })
      if (!blocked) {
        for (const request of requestsRepo.undelivered(db, chatId)) {
          if (request.outcome === null) continue
          await updateRequest(context, request.id, request.kind, {
            message: request.outcome,
            done: request.done,
            key: request.key ?? undefined,
          })
        }
      }
      return
    }
    if (event.type === 'chat_cleared') {
      messagesRepo.clearChat(db, chatId)
      return
    }

    const chat = chatsRepo.find(db, chatId)
    if (
      event.chat.blocked ||
      chat?.blocked ||
      (chat && chat.userId !== event.user.id)
    )
      return
    const role = chat?.role
    const principalUuid = chat?.recipientUuid ?? undefined
    const callback = event.type === 'callback' ? event : null
    const command = parseCommand(event)
    if (!command && !callback && event.type !== 'chat_started') return

    const interactionId = callback
      ? `callback:${callback.callbackId}`
      : event.type === 'message' || event.type === 'command'
        ? `message:${event.message.id}`
        : null
    const recorded = interactionId
      ? interactionsRepo.find(db, interactionId)
      : undefined
    if (recorded?.sent) return

    if (callback) {
      try {
        await api.answerCallback({ callbackId: callback.callbackId })
      } catch (error) {
        if (!(error instanceof BotApiError && error.code === 'NOT_FOUND'))
          throw error
      }
    }

    const dispatch = async () => {
      if (callback) {
        if (!role || !principalUuid)
          return text('Войдите через /start <код доступа>.')
        if (callback.data === 'clip' || callback.data === 'snapshot') {
          return eventButton(
            context,
            chatId,
            callback.messageId,
            callback.data,
            principalUuid,
          )
        }
        if (callback.data.startsWith('request:'))
          return requestButton(
            context,
            callback.data.slice(8),
            chatId,
            callback.messageId,
          )
        return null
      }
      if (!command)
        return role
          ? null
          : text('Для входа в Spotter отправьте /start <код доступа>.')
      const { name, args } = command
      const entry = Object.hasOwn(commands, name) ? commands[name] : undefined
      if (!entry)
        return text('Неизвестная команда. Доступные команды есть в меню бота.')
      if (entry.access !== 'all' && !satisfies(entry.access, role))
        return text('Команда недоступна для вашей роли.')
      if (entry.cooldown && throttle.remaining(chatId, name, entry.cooldown))
        return text('Команда уже выполнялась недавно. Попробуйте чуть позже.')
      const requestId = `appercot:${new Bun.CryptoHasher('sha256').update(`${chatId}:${interactionId}`).digest('hex')}`
      const response = await entry.handle({
        context,
        chatId,
        userId: event.user.id,
        username: event.user.username,
        requestId,
        principalUuid,
        role,
        args,
      })
      if (entry.cooldown) throttle.mark(chatId, name)
      return response
    }

    const response = recorded ? recorded.content : await dispatch()
    if (interactionId && !recorded)
      interactionsRepo.record(db, interactionId, response)
    if (command && ['start', 'login', 'logout'].includes(command.name)) {
      const updated = chatsRepo.find(db, chatId)?.role
      const current = roles.find((role) =>
        Object.values(menuRoles).some((known) => known === role),
      )
      if (
        (updated ? menuRoles[updated] : undefined) !== current &&
        !roles.includes('owner')
      )
        await syncRole(context, chatId, updated)
    }
    if (response) {
      try {
        await api.sendMessage({
          chatId,
          content: content(response),
          ...(callback && { replyTo: callback.messageId }),
        })
      } catch (error) {
        if (!ignoreUnavailable(context, chatId, error)) throw error
      }
    }
    if (interactionId) interactionsRepo.sent(db, interactionId)
  }

  return {
    async receive(event: BotEvent) {
      if (stopping) throw new Error('Appercot router is stopping')
      const id = event.chat.id
      const current = (
        queue.get(id)?.catch(() => {}) ?? Promise.resolve()
      ).then(() => handle(event))
      queue.set(id, current)
      try {
        await current
      } finally {
        if (queue.get(id) === current) queue.delete(id)
      }
    },
    async drain() {
      stopping = true
      await Promise.allSettled(queue.values())
    },
    sweep: () => throttle.sweep(5 * 60_000),
  }
}
