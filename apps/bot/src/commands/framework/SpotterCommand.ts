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

/** Enforces a command's access requirement using the role cached in the session. */
export const accessGuard = (access: Access): CommandMiddleware<BotContext> => {
  return async (context, next) => {
    if (!canAccess(access, context.session.user.authorizedRole)) {
      return context.reply(accessDenial(access))
    }
    return next()
  }
}

/**
 * A bot command as a class. Subclasses declare metadata + a handler; the
 * framework composes the chain (access → arguments → sender → handler) and
 * exposes a {@link BotCommand} for the dynamic menu.
 */
export abstract class SpotterCommand {
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly access: Access

  /** Argument validator; when set, runs before the handler with `signature` help. */
  protected readonly matcher?: ArgumentMatcher
  protected readonly signature?: string

  /** Require `ctx.from`; false only for commands that may run without a sender. */
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
