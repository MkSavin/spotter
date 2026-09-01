import { normalizeUsername, type Role } from '@spotter/transport'
import { InputFile } from 'grammy'
import { renderQr } from '../../auth/qr'
import { deepLink } from '../../auth/token'
import type { BotContext } from '../../context'
import { roleTitle } from '../../helpers/role'
import { SpotterCommand } from '../framework/SpotterCommand'
import { roleArg } from './userArgs'

class UserSignCommand extends SpotterCommand {
  readonly name = 'user_sign'
  readonly description = 'Создать код доступа и QR-код'
  readonly access = 'ADMIN' as const

  readonly args = [
    {
      name: 'username',
      hint: '@username',
      optional: true,
      ask: true,
      prompt:
        '🔑 <b>Кому выдать код?</b>\n\nВведите <code>@username</code> или пропустите — код подойдёт любому, в том числе для входа в веб-приложение.',
    },
    { ...roleArg, optional: true, ask: true },
  ]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const logger = context.logger.sub('auth')
    const from = context.from
    if (!from) return

    const username = args.username
      ? normalizeUsername(args.username)
      : undefined
    const role = args.role as Role | undefined

    let reply: Awaited<ReturnType<typeof context.commandBus.send>>
    try {
      reply = await context.commandBus.send(
        'user.sign',
        { username, role },
        context.session.user.recipientUuid,
      )
    } catch {
      await context.reply('Сервис временно недоступен.')
      return
    }

    if (!reply.ok) {
      await context.reply(`Ошибка: ${reply.error}`)
      return
    }

    const { code, role: grantedRole } = reply.data as {
      code: string
      role: Role
    }
    const link = deepLink(context.me.username, code)
    const qr = await renderQr(link)

    logger.info(
      `@${from.username}#${from.id} issued a ${grantedRole} code${username ? ` bound to @${username}` : ''}`,
    )

    // A bound code cannot be redeemed by a PWA install — there is no username
    // on a device to match it against — so say so where it is decided.
    const binding = username
      ? `🔒 Активировать сможет только <b>@${username}</b> в Telegram`
      : '🔓 Подойдёт любому — и в Telegram, и в веб-приложении'

    await context.replyWithPhoto(new InputFile(qr, 'access-code.png'), {
      parse_mode: 'HTML',
      caption: `🔑 <b>Код доступа создан!</b>

Роль: <b>${roleTitle(grantedRole)}</b>
${binding}

Отсканируйте QR-код или активируйте вручную:
<code>/login ${code}</code>

🔗 ${link}`,
    })
  }
}

export const userSignCommand = new UserSignCommand()
