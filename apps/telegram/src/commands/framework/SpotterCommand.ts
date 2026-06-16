import type { CommandContext, Middleware } from 'grammy'
import type { BotCommand } from 'grammy/types'
import type { BotContext } from '../../context'
import {
  type ArgumentMatcher,
  argument,
} from '../../middlewares/command/argument'
import { sender } from '../../middlewares/command/sender'
import type { CommandMiddleware } from '../../middlewares/types'
import { type Access, accessDenial, canAccess } from './access'

type Handler = CommandContext<BotContext>

export const accessGuard = (access: Access): CommandMiddleware<BotContext> => {
  return async (context, next) => {
    if (!canAccess(access, context.session.user.authorizedRole)) {
      return context.reply(accessDenial(access))
    }
    return next()
  }
}

export abstract class SpotterCommand {
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly access: Access

  protected readonly matcher?: ArgumentMatcher
  protected readonly signature?: string
  protected readonly requireSender: boolean = true

  abstract handle(context: Handler): unknown

  middlewares(): Middleware<Handler>[] {
    const chain: Middleware<Handler>[] = [accessGuard(this.access)]

    if (this.matcher) {
      chain.push(argument(this.matcher, this.signature ?? `${this.name} ...`))
    }

    if (this.requireSender) {
      chain.push(sender('present'))
    }

    chain.push((context, next) =>
      Promise.resolve(this.handle(context)).then(() => next()),
    )

    return chain
  }

  toBotCommand(): BotCommand {
    return { command: this.name, description: this.description }
  }
}
