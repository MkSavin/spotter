import type { CommandGroup } from '@grammyjs/commands'
import type { Middleware } from 'grammy'
import type { Context as BaseContext } from 'grammy/out/context'
import { Role } from '../../../../../.prisma-generated'
import type { BotContext as GeneralContext } from '../../context'

type CommandListPack<Context extends GeneralContext> = {
  anonymous: CommandGroup<Context>
  user: CommandGroup<Context>
  admin: CommandGroup<Context>
}

export const switchCommandList =
  <Context extends GeneralContext>(
    pack: CommandListPack<Context>,
  ): Middleware<Context> =>
  async (context, next) => {
    if (!context.session.user.needUpdateCommands) {
      return next()
    }

    const role = context.session.user.authorizedRole

    const type: keyof typeof pack = role
      ? role === Role.ADMIN
        ? 'admin'
        : 'user'
      : 'anonymous'

    const list = pack[type]

    context.session.user.needUpdateCommands = false

    context.logger.debug(`Command list updated using ${type} pack`)

    await context.setMyCommands(list as CommandGroup<BaseContext>)

    return next()
  }
