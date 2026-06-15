import { describe, expect, mock, test } from 'bun:test'
import type { BotContext } from '../../context'
import { Role } from '../../db/schema'
import { guard } from './guard'

const context = (role: Role | undefined) => {
  const reply = mock(async () => undefined)
  return {
    reply,
    session: { user: { authorizedRole: role } },
  } as unknown as BotContext & { reply: ReturnType<typeof mock> }
}

const run = (
  instruction: Parameters<typeof guard>[0],
  role: Role | undefined,
) => {
  const ctx = context(role)
  const next = mock(async () => undefined)
  const middleware = guard(instruction) as (
    ctx: BotContext,
    next: () => Promise<void>,
  ) => Promise<unknown>
  return middleware(ctx, next).then(() => ({ ctx, next }))
}

describe('guard middleware', () => {
  test('authorized: passes for a user with a role, blocks anonymous', async () => {
    const allowed = await run('authorized', Role.USER)
    expect(allowed.next).toHaveBeenCalledTimes(1)
    expect(allowed.ctx.reply).not.toHaveBeenCalled()

    const blocked = await run('authorized', undefined)
    expect(blocked.next).not.toHaveBeenCalled()
    expect(blocked.ctx.reply).toHaveBeenCalledTimes(1)
  })

  test('anonymous: passes without a role, blocks an authorized user', async () => {
    const allowed = await run('anonymous', undefined)
    expect(allowed.next).toHaveBeenCalledTimes(1)

    const blocked = await run('anonymous', Role.ADMIN)
    expect(blocked.next).not.toHaveBeenCalled()
    expect(blocked.ctx.reply).toHaveBeenCalledTimes(1)
  })

  test('a specific role passes only for an exact match', async () => {
    const allowed = await run(Role.ADMIN, Role.ADMIN)
    expect(allowed.next).toHaveBeenCalledTimes(1)

    const blocked = await run(Role.ADMIN, Role.USER)
    expect(blocked.next).not.toHaveBeenCalled()
    expect(blocked.ctx.reply).toHaveBeenCalledTimes(1)
  })
})
