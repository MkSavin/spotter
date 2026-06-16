import { loginWithCode } from '../../auth/login'
import type { BotContext } from '../../context'
import { SpotterCommand } from '../framework/SpotterCommand'

class StartCommand extends SpotterCommand {
  readonly name = 'start'
  readonly description = 'Начать работу с ботом'
  readonly access = 'all' as const

  async handle(context: BotContext): Promise<void> {
    const payload =
      typeof context.match === 'string' ? context.match.trim() : ''

    if (payload && !context.session.user.authorizedRole) {
      return loginWithCode(context, payload)
    }

    await context.replyWithHTML(
      `📹 <b>Бот-помощник для работы с NVR</b>

\u{2709}\u{FE0F} Отправляет оповещения и медиа-данные произошедших событий
📊 Позволяет получать статистику и общую информацию об инстансе NVR
🖼 Позволяет быстро получить актуальный скриншот или таймлепс с камер

Для начала работы с ботом авторизуйтесь через команду /login [код доступа]`,
    )
  }
}

export const startCommand = new StartCommand()
