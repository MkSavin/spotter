import { describe, expect, mock, test } from 'bun:test'
import type { BotContext } from '../../context'
import { argument } from './argument'

const context = (match: string | RegExpMatchArray | undefined) => {
  const replyWithHTML = mock(async () => undefined)
  return {
    match,
    replyWithHTML,
  } as unknown as BotContext & { replyWithHTML: ReturnType<typeof mock> }
}

const run = (
  matcher: Parameters<typeof argument>[0],
  match: string | RegExpMatchArray | undefined,
) => {
  const ctx = context(match)
  const next = mock(async () => undefined)
  const middleware = argument(matcher, 'команда <код>') as (
    ctx: BotContext,
    next: () => Promise<void>,
  ) => Promise<unknown>
  return middleware(ctx, next).then(() => ({ ctx, next }))
}

describe('argument middleware', () => {
  test('string matcher passes only for a non-empty string argument', async () => {
    const ok = await run(argument.string, 'front')
    expect(ok.next).toHaveBeenCalledTimes(1)
    expect(ok.ctx.replyWithHTML).not.toHaveBeenCalled()

    const missing = await run(argument.string, undefined)
    expect(missing.next).not.toHaveBeenCalled()
    expect(missing.ctx.replyWithHTML).toHaveBeenCalledTimes(1)
  })

  test('optional string matcher passes for both a string and no argument', async () => {
    const withArg = await run(argument.stringOptional, 'front')
    expect(withArg.next).toHaveBeenCalledTimes(1)

    const withoutArg = await run(argument.stringOptional, undefined)
    expect(withoutArg.next).toHaveBeenCalledTimes(1)
    expect(withoutArg.ctx.replyWithHTML).not.toHaveBeenCalled()
  })

  test('reply renders the signature label on a bad argument list', async () => {
    const { ctx } = await run(argument.string, undefined)
    const message = ctx.replyWithHTML.mock.calls[0][0] as string
    expect(message).toContain('команда <код>')
  })
})
