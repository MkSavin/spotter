import { describe, expect, mock, test } from 'bun:test'
import type { BotContext } from '../context'
import {
  activeDialog,
  applyResult,
  skipStep,
  startDialog,
  stepBack,
} from './Dialog'
import { textStep } from './steps/TextStep'
import type { DialogComplete, DialogDefinition, DialogState } from './types'

const completeMock = () => mock<DialogComplete>(async () => undefined)

/** `sent` is what the user sees: the dialog edits one message in place. */
const makeContext = () => {
  const sent: string[] = []
  const deleted = mock(async () => undefined)
  let messages = 0
  const context = {
    chatId: 1,
    session: { user: { dialog: undefined as DialogState | undefined } },
    logger: { debug: mock(() => undefined) },
    api: {
      editMessageText: mock(
        async (_chat: number, _id: number, text: string) => {
          sent.push(text)
        },
      ),
      deleteMessage: deleted,
    },
    replyWithHTML: mock(async (text: string) => {
      sent.push(text)
      messages += 1
      return { message_id: messages }
    }),
  } as unknown as BotContext
  return { context, sent, deleted }
}

const definition = (complete = completeMock()): DialogDefinition => ({
  kind: 'test',
  steps: [
    textStep({ name: 'first', prompt: 'Первый?' }),
    textStep({ name: 'second', prompt: 'Второй?' }),
  ],
  complete,
})

describe('startDialog', () => {
  test('asks the first question and stores the state', async () => {
    const { context, sent } = makeContext()
    await startDialog(context, definition())

    expect(sent[0]).toBe('Первый?')
    expect(context.session.user.dialog?.step).toBe(0)
  })

  test('skips steps whose value was already supplied', async () => {
    const { context, sent } = makeContext()
    await startDialog(context, definition(), { first: 'a' })

    expect(sent[0]).toBe('Второй?')
    expect(context.session.user.dialog?.step).toBe(1)
  })

  test('completes without asking when every value is known', async () => {
    const complete = completeMock()
    const { context, sent } = makeContext()
    await startDialog(context, definition(complete), {
      first: 'a',
      second: 'b',
    })

    expect(complete).toHaveBeenCalledTimes(1)
    expect(sent).toHaveLength(0)
    expect(context.session.user.dialog).toBeUndefined()
  })

  test('starting a dialog replaces the one already running', async () => {
    const { context } = makeContext()
    await startDialog(context, definition())
    const first = context.session.user.dialog?.id

    await startDialog(context, definition())

    expect(context.session.user.dialog?.id).not.toBe(first)
  })
})

describe('applyResult', () => {
  test('a done value advances to the next question', async () => {
    const { context, sent } = makeContext()
    const spec = definition()
    await startDialog(context, spec)

    const state = context.session.user.dialog as DialogState
    await applyResult(context, spec, state, { status: 'done', value: 'a' })

    expect(sent.at(-1)).toBe('Второй?')
    expect(state.values).toEqual({ first: 'a' })
  })

  test('the last answer completes the dialog and clears the state', async () => {
    const complete = completeMock()
    const { context } = makeContext()
    const spec = definition(complete)
    await startDialog(context, spec, { first: 'a' })

    const state = context.session.user.dialog as DialogState
    await applyResult(context, spec, state, { status: 'done', value: 'b' })

    expect(complete.mock.calls[0][1]).toEqual({ first: 'a', second: 'b' })
    expect(context.session.user.dialog).toBeUndefined()
  })

  test('the prompt is removed once the dialog completes', async () => {
    const { context, deleted } = makeContext()
    const spec = definition()
    await startDialog(context, spec, { first: 'a' })

    const state = context.session.user.dialog as DialogState
    const promptId = state.promptMessageId
    await applyResult(context, spec, state, { status: 'done', value: 'b' })

    expect(deleted).toHaveBeenCalledWith(1, promptId)
  })

  test('a cancel removes the prompt too', async () => {
    const { context, deleted } = makeContext()
    const spec = definition()
    await startDialog(context, spec)

    const state = context.session.user.dialog as DialogState
    await applyResult(context, spec, state, { status: 'cancel' })

    expect(deleted).toHaveBeenCalledTimes(1)
  })

  test('a retry re-asks without losing the dialog', async () => {
    const { context, sent } = makeContext()
    const spec = definition()
    await startDialog(context, spec)

    const state = context.session.user.dialog as DialogState
    await applyResult(context, spec, state, {
      status: 'retry',
      error: 'Не то',
    })

    expect(sent.at(-1)).toContain('Не то')
    expect(context.session.user.dialog).toBeDefined()
  })

  test('a cancel drops the dialog', async () => {
    const { context } = makeContext()
    const spec = definition()
    await startDialog(context, spec)

    const state = context.session.user.dialog as DialogState
    await applyResult(context, spec, state, { status: 'cancel' })

    expect(context.session.user.dialog).toBeUndefined()
  })
})

describe('navigation', () => {
  test('back returns to the previous question and forgets its answer', async () => {
    const { context, sent } = makeContext()
    const spec = definition()
    await startDialog(context, spec)

    const state = context.session.user.dialog as DialogState
    await applyResult(context, spec, state, { status: 'done', value: 'a' })
    await stepBack(context, spec, state)

    expect(sent.at(-1)).toBe('Первый?')
    expect(state.values).toEqual({})
  })

  test('back on the first step does nothing', async () => {
    const { context } = makeContext()
    const spec = definition()
    await startDialog(context, spec)

    const state = context.session.user.dialog as DialogState
    await stepBack(context, spec, state)

    expect(state.step).toBe(0)
  })

  test('skip leaves the value unset and moves on', async () => {
    const { context, sent } = makeContext()
    const spec = definition()
    await startDialog(context, spec)

    const state = context.session.user.dialog as DialogState
    await skipStep(context, spec, state)

    expect(sent.at(-1)).toBe('Второй?')
    expect(state.values.first).toBeUndefined()
  })
})

describe('activeDialog', () => {
  test('an expired dialog is dropped rather than answered', async () => {
    const { context } = makeContext()
    await startDialog(context, definition())

    const state = context.session.user.dialog as DialogState
    state.touchedAt = Date.now() - 600_000

    expect(activeDialog(context)).toBeUndefined()
    expect(context.session.user.dialog).toBeUndefined()
  })

  test('a fresh dialog is returned', async () => {
    const { context } = makeContext()
    await startDialog(context, definition())

    expect(activeDialog(context)).toBeDefined()
  })
})
