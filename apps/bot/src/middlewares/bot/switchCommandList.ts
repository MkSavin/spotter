import type { CommandGroup } from '@grammyjs/commands'
import { $Enums } from '@prisma/client'
import type { Middleware } from 'grammy'
import type { Context as BaseContext } from 'grammy/out/context'
import type { Context as GeneralContext } from '../../context'

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
    if (!context.session.needUpdateCommands) {
      return next()
    }

    const user = context.auth?.user

    const type: keyof typeof pack = user
      ? user.role === $Enums.Role.ADMIN
        ? 'admin'
        : 'user'
      : 'anonymous'

    const list = pack[type]

    context.session.needUpdateCommands = false

    context.logger.debug(`Command list updated using ${type} pack`)

    await context.setMyCommands(list as CommandGroup<BaseContext>)

    return next()
  }
