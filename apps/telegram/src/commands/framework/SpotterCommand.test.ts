import { describe, expect, mock, test } from 'bun:test'
import type { CommandContext } from 'grammy'
import type { BotContext } from '../../context'
import { startDialog } from '../../dialog/Dialog'
import type { DialogState } from '../../dialog/types'
import type { ArgSpec } from '../../middlewares/command/argument'
import { SpotterCommand } from './SpotterCommand'

const ran = mock((_args: Record<string, string>) => undefined)

class AdminCommand extends SpotterCommand {
  readonly name = 'user_promote'
  readonly description = 'test'
  readonly access = 'ADMIN' as const

  readonly args: ArgSpec[] = [{ name: 'ref', prompt: 'Кого?' }]

  async handle(
    _context: CommandContext<BotContext>,
    args: Record<string, string>,
  ): Promise<void> {
    ran(args)
  }
}

const command = new AdminCommand()

const makeContext = (role: string | null, match?: string) =>
  ({
    chatId: 1,
    from: { id: 2 },
    match,
    session: { user: { authorizedRole: role, dialog: undefined } },
    logger: { debug: mock(() => undefined), warn: mock(() => undefined) },
    api: { editMessageText: mock(async () => undefined) },
    reply: mock(async () => undefined),
    replyWithHTML: mock(async () => ({ message_id: 1 })),
  }) as unknown as BotContext & { reply: ReturnType<typeof mock> }

/** Drives the command's middleware chain the way grammY would. */
const invoke = async (context: BotContext) => {
  const chain = command.middlewares() as ((
    ctx: BotContext,
    next: () => Promise<void>,
  ) => Promise<unknown>)[]

  for (const middleware of chain) {
    let advanced = false
    await middleware(context, async () => {
      advanced = true
    })
    if (!advanced) return
  }
}

describe('SpotterCommand access', () => {
  test('an admin running it inline is allowed through', async () => {
    ran.mockClear()
    await invoke(makeContext('ADMIN', '@vasya'))

    expect(ran).toHaveBeenCalledTimes(1)
  })

  test('a non-admin is refused and never reaches the handler', async () => {
    ran.mockClear()
    const context = makeContext('USER', '@vasya')
    await invoke(context)

    expect(ran).not.toHaveBeenCalled()
    expect(context.reply).toHaveBeenCalledTimes(1)
  })

  test('a non-admin cannot start the dialog either', async () => {
    ran.mockClear()
    const context = makeContext('USER')
    await invoke(context)

    expect(context.session.user.dialog).toBeUndefined()
    expect(ran).not.toHaveBeenCalled()
  })

  test('a role lost mid-dialog blocks completion', async () => {
    ran.mockClear()
    const context = makeContext('ADMIN')
    await invoke(context)

    const definition = command.dialog()
    // The user is demoted while the prompt is on screen.
    context.session.user.authorizedRole = 'USER' as never

    await definition.complete(context, { ref: '@vasya' })

    expect(ran).not.toHaveBeenCalled()
  })
})

describe('SpotterCommand dialog start', () => {
  test('a missing argument starts a dialog instead of erroring', async () => {
    ran.mockClear()
    const context = makeContext('ADMIN')
    await invoke(context)

    expect(ran).not.toHaveBeenCalled()
    expect((context.session.user.dialog as DialogState)?.kind).toBe(
      'args:user_promote',
    )
  })

  test('the command does not fall through after starting a dialog', async () => {
    const context = makeContext('ADMIN')
    const chain = command.middlewares() as ((
      ctx: BotContext,
      next: () => Promise<void>,
    ) => Promise<unknown>)[]
    const next = mock(async () => undefined)

    await chain[chain.length - 1](context, next)

    expect(next).not.toHaveBeenCalled()
  })
})

class OptionalCommand extends SpotterCommand {
  readonly name = 'test_delivery'
  readonly description = 'test'
  readonly access = 'ADMIN' as const

  readonly args: ArgSpec[] = [{ name: 'id', optional: true, prompt: 'Id?' }]

  async handle(
    _context: CommandContext<BotContext>,
    args: Record<string, string>,
  ): Promise<void> {
    ran(args)
  }
}

class AskingCommand extends SpotterCommand {
  readonly name = 'user_sign'
  readonly description = 'test'
  readonly access = 'ADMIN' as const

  readonly args: ArgSpec[] = [
    { name: 'username', optional: true, ask: true, prompt: 'Кому?' },
  ]

  async handle(
    _context: CommandContext<BotContext>,
    args: Record<string, string>,
  ): Promise<void> {
    ran(args)
  }
}

const runChain = async (target: SpotterCommand, context: BotContext) => {
  const chain = target.middlewares() as ((
    ctx: BotContext,
    next: () => Promise<void>,
  ) => Promise<unknown>)[]
  for (const middleware of chain) {
    let advanced = false
    await middleware(context, async () => {
      advanced = true
    })
    if (!advanced) return
  }
}

describe('optional arguments', () => {
  test('a plain optional argument runs on its default without asking', async () => {
    ran.mockClear()
    const context = makeContext('ADMIN')
    await runChain(new OptionalCommand(), context)

    expect(ran).toHaveBeenCalledWith({})
    expect(context.session.user.dialog).toBeUndefined()
  })

  test('an `ask` optional argument opens a dialog instead', async () => {
    ran.mockClear()
    const context = makeContext('ADMIN')
    await runChain(new AskingCommand(), context)

    expect(ran).not.toHaveBeenCalled()
    expect(context.session.user.dialog?.kind).toBe('args:user_sign')
  })

  test('skipping an asked optional argument still completes', async () => {
    ran.mockClear()
    const command = new AskingCommand()
    const context = makeContext('ADMIN')
    await runChain(command, context)

    const { skipStep } = await import('../../dialog/Dialog')
    await skipStep(
      context,
      command.dialog(),
      context.session.user.dialog as DialogState,
    )

    expect(ran).toHaveBeenCalledWith({})
  })
})

describe('startDialog reuse', () => {
  test('the generated definition carries one step per argument', async () => {
    const context = makeContext('ADMIN')
    await startDialog(context, command.dialog())

    expect(command.dialog().steps).toHaveLength(1)
    expect(context.session.user.dialog?.step).toBe(0)
  })
})
