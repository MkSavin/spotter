import { normalizeUsername, type Role } from '@spotter/transport'
import { InputFile } from 'grammy'
import { authorizeLink, pwaUrl } from '../../auth/pwaLink'
import { renderQr } from '../../auth/qr'
import { deepLink } from '../../auth/token'
import type { BotContext } from '../../context'
import { roleTitle } from '../../helpers/role'
import { askDomain } from '../framework/askDomain'
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

    const reply = await askDomain(context, 'user.sign', { username, role })
    if (!reply) return

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
    // on a device to match it against — so say so where it is decided, and do
    // not offer a web link that is guaranteed to be refused.
    const binding = username
      ? `🔒 Активировать сможет только <b>@${username}</b> в Telegram`
      : '🔓 Подойдёт любому — и в Telegram, и в веб-приложении'

    const web = username ? null : pwaUrl(context.heartbeats.all())

    // The code on its own line, with nothing else inside the tag: a tap copies
    // exactly what the web app's field expects. Wrapping it in `/login …` made
    // the command come along, and it had to be edited out by hand.
    const parts = [
      `🔑 <b>Код доступа создан!</b>`,
      ``,
      `Роль: <b>${roleTitle(grantedRole)}</b>`,
      binding,
      ``,
      `Код (нажмите, чтобы скопировать):`,
      `<code>${code}</code>`,
      ``,
      `В Telegram — отсканируйте QR или откройте ссылку:`,
      `🔗 ${link}`,
    ]

    if (web) {
      parts.push(
        ``,
        `В веб-приложении — вход одним нажатием:`,
        `🌐 ${authorizeLink(web, code)}`,
      )
    }

    await context.replyWithPhoto(new InputFile(qr, 'access-code.png'), {
      parse_mode: 'HTML',
      caption: parts.join('\n'),
    })
  }
}

export const userSignCommand = new UserSignCommand()
