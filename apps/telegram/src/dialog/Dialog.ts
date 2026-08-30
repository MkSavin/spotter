import type { BotContext } from '../context'
import { newDialogId } from './callbackData'
import { renderPrompt } from './render'
import { dropDialog, loadDialog, saveDialog } from './store'
import type { DialogDefinition, DialogState, StepResult } from './types'

/** A dialog left untouched this long is abandoned, not answered. */
export const DIALOG_TTL_MS = 300_000

/** Measured from the last answer: a slow wizard must not expire mid-use. */
export const isExpired = (state: DialogState, ttlMs = DIALOG_TTL_MS): boolean =>
  Date.now() - (state.touchedAt ?? state.startedAt) >= ttlMs

/** Reads the live dialog, dropping it if it has aged out. */
export const activeDialog = (
  context: BotContext,
  ttlMs = DIALOG_TTL_MS,
): DialogState | undefined => {
  const state = loadDialog(context)
  if (!state) return undefined

  if (isExpired(state, ttlMs)) {
    clearDialog(context)
    return undefined
  }

  return state
}

export const clearDialog = (context: BotContext): void => {
  context.session.user.dialog = undefined
  dropDialog(context)
}

/** Mirrors the session copy into SQLite so a restart resumes where it stopped. */
const persist = (context: BotContext, state: DialogState): void => {
  state.touchedAt = Date.now()
  context.session.user.dialog = state
  saveDialog(context, state)
}

/**
 * Starts a dialog at `step`, carrying `values` already known. Prefilled
 * arguments skip their step, so a partially typed command only asks for what
 * is missing.
 */
export const startDialog = async (
  context: BotContext,
  definition: DialogDefinition,
  values: Record<string, string> = {},
): Promise<void> => {
  const state: DialogState = {
    id: newDialogId(),
    kind: definition.kind,
    step: 0,
    page: 0,
    values,
    startedAt: Date.now(),
  }

  // Starting a dialog abandons whatever was running: they never stack.
  persist(context, state)

  await advance(context, definition, state)
}

/** Moves to the first unanswered step, completing the dialog if there is none. */
export const advance = async (
  context: BotContext,
  definition: DialogDefinition,
  state: DialogState,
): Promise<void> => {
  while (
    state.step < definition.steps.length &&
    definition.steps[state.step].name in state.values
  ) {
    state.step += 1
  }

  if (state.step >= definition.steps.length) {
    clearDialog(context)
    await definition.complete(context, state.values)
    return
  }

  await show(context, definition, state)
}

/** Renders the current step and remembers the options it offered. */
export const show = async (
  context: BotContext,
  definition: DialogDefinition,
  state: DialogState,
  error?: string,
): Promise<void> => {
  const step = definition.steps[state.step]
  const { rendered, options } = await step.render(context, {
    dialogId: state.id,
    step: state.step,
    page: state.page,
  })

  state.options = options

  const text = error ? `⚠️ ${error}\n\n${rendered.text}` : rendered.text

  state.promptMessageId = await renderPrompt(context, {
    text,
    keyboard: rendered.keyboard,
    messageId: state.promptMessageId,
  })

  persist(context, state)
}

/** Applies a step result, moving the dialog forward, back or to the bin. */
export const applyResult = async (
  context: BotContext,
  definition: DialogDefinition,
  state: DialogState,
  result: StepResult,
): Promise<void> => {
  if (result.status === 'cancel') {
    clearDialog(context)
    await renderPrompt(context, {
      text: '✖ Отменено',
      messageId: state.promptMessageId,
    })
    return
  }

  if (result.status === 'retry') {
    await show(context, definition, state, result.error)
    return
  }

  state.values[definition.steps[state.step].name] = result.value
  state.step += 1
  state.page = 0
  await advance(context, definition, state)
}

/** Steps back to the previous question, discarding its stored answer. */
export const stepBack = async (
  context: BotContext,
  definition: DialogDefinition,
  state: DialogState,
): Promise<void> => {
  if (state.step === 0) return

  state.step -= 1
  state.page = 0
  delete state.values[definition.steps[state.step].name]

  await show(context, definition, state)
}

/** Leaves an optional step unanswered and moves on. */
export const skipStep = async (
  context: BotContext,
  definition: DialogDefinition,
  state: DialogState,
): Promise<void> => {
  state.step += 1
  state.page = 0
  await advance(context, definition, state)
}
