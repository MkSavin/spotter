import type { Chat, EventMessage } from '@prisma/client'

type AffectedDifference = {
  added: Pick<Chat, 'id'>[]
  intersected: EventMessage[]
  removed: EventMessage[]
}

export const diffAffectedChats = (
  actualChats: Pick<Chat, 'id'>[],
  sentMessages: EventMessage[],
): AffectedDifference => {
  const actualChatIds = actualChats.map((chat) => chat.id)
  const sentChatIds = sentMessages.map((entry) => entry.chatId)

  const addedIds = actualChatIds.filter((id) => !sentChatIds.includes(id))
  const intersectedIds = actualChatIds.filter((id) => sentChatIds.includes(id))
  const removedIds = sentChatIds.filter((id) => !actualChatIds.includes(id))

  return {
    added: actualChats.filter((chat) => addedIds.includes(chat.id)),
    intersected: sentMessages.filter((message) =>
      intersectedIds.includes(message.chatId),
    ),
    removed: sentMessages.filter((message) =>
      removedIds.includes(message.chatId),
    ),
  }
}
