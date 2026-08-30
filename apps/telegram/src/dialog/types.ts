import type { InlineKeyboard } from 'grammy'
import type { BotContext } from '../context'

/** One selectable option: a stable code and its display label. */
export type Choice = { code: string; label: string }

/** What a step did with the answer it was given. */
export type StepResult =
  | { status: 'done'; value: string }
  /** Ask again without tearing the dialog down. */
  | { status: 'retry'; error: string }
  | { status: 'cancel' }

/** A rendered question: text plus the keyboard to answer it with. */
export type Rendered = {
  text: string
  keyboard?: InlineKeyboard
  /** Whether a plain text message counts as an answer to this step. */
  acceptsText: boolean
}

export type StepRenderContext = {
  /** Identifies the running dialog so stale keyboards can be ignored. */
  dialogId: string
  step: number
  page: number
}

export type Step = {
  name: string
  optional?: boolean
  render: (
    context: BotContext,
    render: StepRenderContext,
  ) => Promise<{ rendered: Rendered; options?: Choice[] }>
  /** Answer via inline button; `options` is the snapshot shown to the user. */
  accept?: (
    payload: string,
    context: BotContext,
    options: Choice[] | undefined,
  ) => StepResult | Promise<StepResult>
  /** Answer via a text message. */
  acceptText?: (
    raw: string,
    context: BotContext,
  ) => StepResult | Promise<StepResult>
}

/** Serializable progress of a running dialog; lives in the session. */
export type DialogState = {
  id: string
  kind: string
  step: number
  page: number
  values: Record<string, string>
  /** Snapshot of the current step's options: indexes resolve against this. */
  options?: Choice[]
  promptMessageId?: number
  startedAt: number
  /** Last interaction; the TTL runs from here, not from the start. */
  touchedAt?: number
}

/** Runs when every step has an answer. */
export type DialogComplete = (
  context: BotContext,
  values: Record<string, string>,
) => Promise<void> | void

export type DialogDefinition = {
  kind: string
  steps: Step[]
  complete: DialogComplete
}
