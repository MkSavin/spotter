import type { Chat, User } from '@prisma/client'
import type { Middleware } from 'grammy'
import type { Context } from '../../context'

export const authorize: Middleware<Context> = async (context, next) => {
  let chat: Chat | null = null
  let user: User | null = null

  // TODO: optimize by saving to mem session storage
  if (context.chatId) {
    chat = await context.prisma.chat.findUnique({
      where: {
        id: context.chatId.toString(),
      },
    })
  }

  if (context.from?.id) {
    user = await context.prisma.user.findUnique({
      where: {
        id: context.from.id.toString(),
      },
    })
  }

  context.auth =
    user || chat
      ? {
          user,
          chat,
        }
      : null

  return next()
}
