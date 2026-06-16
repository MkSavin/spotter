import { InputFile } from 'grammy'
import { renderQr } from '../../auth/qr'
import { deepLink } from '../../auth/token'
import type { BotContext } from '../../context'
import { normalizeUsername } from '../../helpers/username'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class UserSignCommand extends SpotterCommand {
  readonly name = 'user_sign'
  readonly description = 'Создать код доступа и QR-код'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.stringOptional
  protected readonly signature = 'user_sign [@username?]'

  async handle(context: BotContext): Promise<void> {
    const logger = context.logger.sub('auth')
    const from = context.from
    if (!from) return

    const username =
      typeof context.match === 'string' && context.match.trim()
        ? normalizeUsername(context.match)
        : undefined

    let reply: Awaited<ReturnType<typeof context.commandBus.send>>
    try {
      reply = await context.commandBus.send('user.sign', { username })
    } catch {
      await context.reply('Сервис временно недоступен.')
      return
    }

    if (!reply.ok) {
      await context.reply(`Ошибка: ${reply.error}`)
      return
    }

    const { code } = reply.data as { code: string }
    const link = deepLink(context.me.username, code)
    const qr = await renderQr(link)

    logger.info(
      `@${from.username}#${from.id} issued an access code${username ? ` bound to @${username}` : ''}`,
    )

    const binding = username
      ? `🔒 Активировать сможет только <b>@${username}</b>`
      : '🔓 Активировать сможет любой пользователь'

    await context.replyWithPhoto(new InputFile(qr, 'access-code.png'), {
      parse_mode: 'HTML',
      caption: `🔑 <b>Код доступа создан!</b>

Роль: <b>наблюдатель</b>
${binding}

Отсканируйте QR-код или активируйте вручную:
<code>/login ${code}</code>

🔗 ${link}`,
    })
  }
}

export const userSignCommand = new UserSignCommand()
