import type { ChatTypeContext, CommandContext, Middleware } from 'grammy'
import type { Chat } from 'grammy/out/types'
import type { BotContext as BaseContext } from '../context'

export type CommandMiddleware<
  Context extends BaseContext,
  Type extends Chat['type'] = 'private' | 'group' | 'channel' | 'supergroup',
> = Middleware<CommandContext<Context> | ChatTypeContext<Context, Type>>
