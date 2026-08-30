import type { CommandContext, Middleware } from 'grammy'
import type { BotCommand } from 'grammy/types'
import type { BotContext } from '../../context'
import { startDialog } from '../../dialog/Dialog'
import type { DialogDefinition } from '../../dialog/types'
import {
  type ArgSpec,
  parsePositional,
  signatureOf,
} from '../../middlewares/command/argument'
import { sender } from '../../middlewares/command/sender'
import type { CommandMiddleware } from '../../middlewares/types'
import { argumentDialog } from './ArgumentDialog'
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

  /** Declared arguments; missing ones are asked for step by step. */
  readonly args: readonly ArgSpec[] = []

  protected readonly requireSender: boolean = true

  abstract handle(context: Handler, args: Record<string, string>): unknown

  get signature(): string {
    return signatureOf(this.name, this.args)
  }

  /** Registered once per command so the engine can resume it after a prompt. */
  dialog(): DialogDefinition {
    return argumentDialog(this.name, this.args, async (context, values) => {
      // Re-checked here, not just at /command: a dialog outlives the request
      // that opened it, and the role may have been revoked meanwhile.
      if (!canAccess(this.access, context.session.user.authorizedRole)) {
        await context.reply(accessDenial(this.access))
        return
      }

      await this.handle(context as Handler, values)
    })
  }

  middlewares(): Middleware<Handler>[] {
    const chain: Middleware<Handler>[] = [accessGuard(this.access)]

    if (this.requireSender) {
      chain.push(sender('present'))
    }

    chain.push(async (context, next) => {
      const values = parsePositional(
        typeof context.match === 'string' ? context.match : undefined,
        this.args,
      )

      // An optional argument only prompts when it opts in with `ask`;
      // otherwise the command runs on its own default.
      const missing = this.args.some(
        (arg) => (!arg.optional || arg.ask) && !(arg.name in values),
      )

      // Everything supplied inline — run without a dialog.
      if (!missing) {
        await this.handle(context, values)
        return next()
      }

      // Stop here: continuing would offer this very command text to the
      // dialog's own text handler as the answer.
      await startDialog(context, this.dialog(), values)
    })

    return chain
  }

  toBotCommand(): BotCommand {
    return { command: this.name, description: this.description }
  }
}
