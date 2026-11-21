import { BotApiError } from '@appercot/chat'
import {
  type BotEvent,
  type MessageContent,
  MessageContentSchema,
  TEXT_MAX,
} from '@appercot/protocol'
import type { Role } from '@spotter/transport'
import type { Context } from './context'
import { chatsRepo } from './db/repository'
import { streamWithStall } from './stallStream'

export const menuRoles = {
  VIEWER: 'spotter_viewer',
  USER: 'spotter_user',
  ADMIN: 'spotter_admin',
} as const

export const syncRole = async (
  context: Context,
  chatId: string,
  role: Role | null | undefined,
) => {
  try {
    await context.api.setChatRoles({
      chatId,
      roles: role ? [menuRoles[role]] : [],
    })
  } catch (error) {
    // Appercot owns the owner role. The router still checks Spotter access.
    if (
      error instanceof BotApiError &&
      error.code === 'BAD_REQUEST' &&
      error.message ===
        'Only one custom role can be assigned to a regular member'
    )
      return
    if (!ignoreUnavailable(context, chatId, error)) throw error
  }
}

export const ignoreUnavailable = (
  context: Context,
  chatId: string,
  error: unknown,
) => {
  if (!(error instanceof BotApiError)) return false
  if (error.code === 'BOT_BLOCKED')
    chatsRepo.update(context.db, chatId, { blocked: true })
  return error.code === 'BOT_BLOCKED' || error.code === 'NOT_FOUND'
}

export const markdown = (value: string) =>
  value.replace(/[\\`*_{}[\]<>()#+.!|~>-]/g, '\\$&')

export const text = (value: string): MessageContent => ({
  text:
    markdown(value.slice(0, TEXT_MAX / 2 - 1)) +
    (value.length >= TEXT_MAX / 2 ? '…' : ''),
})

export const content = (message: MessageContent): MessageContent =>
  MessageContentSchema.parse(message)

export const uploadPhoto = async (
  context: Context,
  chatId: string,
  key: string,
) => {
  try {
    const transfer = streamWithStall(context.s3.file(key).stream())
    return await context.api.uploadFile(chatId, transfer.stream, {
      mime: 'image/jpeg',
      name: 'spotter.jpg',
      signal: transfer.signal,
    })
  } catch {
    context.logger.warn('Appercot photo upload failed; offering a signed link')
    return null
  }
}

export const parseCommand = (event: BotEvent) => {
  if (
    (event.type !== 'message' && event.type !== 'command') ||
    event.message.sender !== 'user'
  )
    return null
  const input = event.message.content.text?.trim() ?? ''
  const match = /^\/([a-z0-9_]+)(?:\s+([\s\S]+))?$/i.exec(input)
  if (match)
    return { name: match[1].toLowerCase(), args: match[2]?.trim() ?? '' }
  return event.type === 'command' ? { name: event.name, args: '' } : null
}
