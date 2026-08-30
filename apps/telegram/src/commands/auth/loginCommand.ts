import { loginWithCode } from '../../auth/login'
import type { BotContext } from '../../context'
import { SpotterCommand } from '../framework/SpotterCommand'

class LoginCommand extends SpotterCommand {
  readonly name = 'login'
  readonly description = 'Авторизоваться в боте'
  readonly access = 'anonymous' as const

  readonly args = [
    {
      name: 'code',
      hint: 'код доступа',
      prompt: '🔑 <b>Введите код доступа</b>',
    },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    await loginWithCode(context, args.code)
  }
}

export const loginCommand = new LoginCommand()
