import { describe, expect, mock, test } from 'bun:test'
import type { BotContext } from '../context'
import { DIALOG_NOOP } from './callbackData'
import { startDialog } from './Dialog'
import { DialogRegistry } from './DialogRegistry'
import { textStep } from './steps/TextStep'
import type { DialogComplete, DialogDefinition, DialogState } from './types'

type TextHandler = (
  context: BotContext,
  next: () => Promise<void>,
) => Promise<unknown>

/** Captures the handler `input()` registers so it can be driven directly. */
const captureInput = (registry: DialogRegistry): TextHandler => {
  let handler: TextHandler | undefined
  const bot = {
    chatType: () => ({
      on: (_filter: string, given: TextHandler) => {
        handler = given
      },
    }),
  }
  registry.input(bot as never)
  if (!handler) throw new Error('input handler was not registered')
  return handler
}

const makeContext = (text: string) => {
  const sent: string[] = []
  return {
    chatId: 1,
    message: { text },
    session: { user: { dialog: undefined as DialogState | undefined } },
    logger: { debug: mock(() => undefined) },
    api: {
      editMessageText: mock(async (_c: number, _i: number, body: string) => {
        sent.push(body)
      }),
    },
    replyWithHTML: mock(async (body: string) => {
      sent.push(body)
      return { message_id: 1 }
    }),
    sent,
  } as unknown as BotContext & { sent: string[] }
}

const definition = (complete: DialogComplete): DialogDefinition => ({
  kind: 'test',
  steps: [textStep({ name: 'value', prompt: 'Значение?' })],
  complete,
})

/** Captures the handler `callbacks()` registers. */
const captureCallback = (registry: DialogRegistry) => {
  let handler: ((context: BotContext) => Promise<unknown>) | undefined
  registry.callbacks({
    callbackQuery: (_pattern: unknown, given: typeof handler) => {
      handler = given
    },
  } as never)
  if (!handler) throw new Error('callback handler was not registered')
  return handler
}

describe('DialogRegistry.callbacks', () => {
  test('the page-counter label is acknowledged, not called stale', async () => {
    const registry = new DialogRegistry().register(
      definition(async () => undefined),
    )
    const handle = captureCallback(registry)
    const answer = mock(async () => undefined)

    await handle({
      callbackQuery: { data: DIALOG_NOOP },
      answerCallbackQuery: answer,
      session: { user: {} },
    } as never)

    expect(answer).toHaveBeenCalledWith()
  })

  test('a keyboard from a superseded dialog reports as stale', async () => {
    const complete = mock<DialogComplete>(async () => undefined)
    const registry = new DialogRegistry().register(definition(complete))
    const handle = captureCallback(registry)
    const answer = mock(async () => undefined)

    const context = makeContext('')
    await startDialog(context, definition(complete))
    ;(context as never as { callbackQuery: unknown }).callbackQuery = {
      data: 'dlg:zzzzzz:0:pick:0',
    }
    ;(
      context as never as { answerCallbackQuery: unknown }
    ).answerCallbackQuery = answer

    await handle(context)

    expect(answer).toHaveBeenCalledWith({ text: 'Диалог устарел' })
  })
})

describe('DialogRegistry.input', () => {
  test('a plain message answers the running step', async () => {
    const complete = mock<DialogComplete>(async () => undefined)
    const registry = new DialogRegistry().register(definition(complete))
    const handle = captureInput(registry)

    const context = makeContext('привет')
    await startDialog(context, definition(complete))
    await handle(context, async () => undefined)

    expect(complete.mock.calls[0][1]).toEqual({ value: 'привет' })
  })

  test('a command abandons the dialog instead of answering it', async () => {
    const complete = mock<DialogComplete>(async () => undefined)
    const registry = new DialogRegistry().register(definition(complete))
    const handle = captureInput(registry)
    const next = mock(async () => undefined)

    const context = makeContext('/status')
    await startDialog(context, definition(complete))
    await handle(context, next)

    expect(complete).not.toHaveBeenCalled()
    expect(context.session.user.dialog).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('a message with no dialog running is passed along', async () => {
    const registry = new DialogRegistry()
    const handle = captureInput(registry)
    const next = mock(async () => undefined)

    await handle(makeContext('привет'), next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  test('a button-only step says so instead of ignoring the message', async () => {
    // Silently dropping the text is what makes a dialog look frozen: no error,
    // no progress, nothing to react to.
    const complete = mock<DialogComplete>(async () => undefined)
    const buttonsOnly: DialogDefinition = {
      kind: 'buttons',
      steps: [
        {
          name: 'choice',
          render: async () => ({
            rendered: { text: 'Выберите', acceptsText: false },
          }),
        },
      ],
      complete,
    }

    const registry = new DialogRegistry().register(buttonsOnly)
    const handle = captureInput(registry)
    const next = mock(async () => undefined)

    const context = makeContext('что-то напечатал')
    await startDialog(context, buttonsOnly)
    await handle(context, next)

    // Still on the same step, and the prompt was re-rendered with the notice.
    expect(complete).not.toHaveBeenCalled()
    expect(context.session.user.dialog).toBeDefined()
    expect(next).not.toHaveBeenCalled()
  })

  test('an expired dialog does not swallow the message', async () => {
    const complete = mock<DialogComplete>(async () => undefined)
    const registry = new DialogRegistry().register(definition(complete))
    const handle = captureInput(registry)
    const next = mock(async () => undefined)

    const context = makeContext('привет')
    await startDialog(context, definition(complete))
    ;(context.session.user.dialog as DialogState).touchedAt =
      Date.now() - 600_000

    await handle(context, next)

    expect(complete).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
