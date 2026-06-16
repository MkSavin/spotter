import { loginWithCode } from '../../auth/login'
import type { BotContext } from '../../context'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class LoginCommand extends SpotterCommand {
  readonly name = 'login'
  readonly description = 'Авторизоваться в боте'
  readonly access = 'anonymous' as const

  protected readonly matcher = argument.string
  protected readonly signature = 'login [код доступа]'

  async handle(context: BotContext): Promise<void> {
    if (typeof context.match !== 'string') return
    await loginWithCode(context, context.match.trim())
  }
}

export const loginCommand = new LoginCommand()
