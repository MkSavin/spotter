import { InlineKeyboard } from 'grammy'
import type { BotContext } from '../../context'
import { DIALOG_NOOP, encodeCallback } from '../callbackData'
import type { Choice, Step, StepResult } from '../types'

/** Options per page: a taller keyboard pushes the message off screen. */
export const PAGE_SIZE = 8

export type ChoiceStepOptions = {
  name: string
  prompt: string
  optional?: boolean
  choices: (context: BotContext) => Choice[] | Promise<Choice[]>
  /** Shown instead of the keyboard when there is nothing to choose from. */
  emptyPrompt?: string
  /** Allow typing a value the list does not offer. */
  allowManual?: boolean
  parse?: (raw: string, context: BotContext) => StepResult
}

export const choiceStep = (options: ChoiceStepOptions): Step => ({
  name: options.name,
  optional: options.optional,

  render: async (context, { dialogId, step, page }) => {
    const all = await options.choices(context)

    // Nothing to show: fall back to typing rather than an empty keyboard.
    if (all.length === 0) {
      return {
        rendered: {
          text: options.emptyPrompt ?? options.prompt,
          keyboard: cancelOnly(dialogId, step),
          acceptsText: true,
        },
        options: [],
      }
    }

    const pages = Math.ceil(all.length / PAGE_SIZE)
    const current = Math.min(Math.max(page, 0), pages - 1)
    const slice = all.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

    const keyboard = new InlineKeyboard()
    for (const [index, choice] of slice.entries()) {
      keyboard
        .text(
          choice.label,
          encodeCallback({
            dialogId,
            step,
            action: 'pick',
            // Index into the full list, so paging does not shift meaning.
            payload: String(current * PAGE_SIZE + index),
          }),
        )
        .row()
    }

    if (pages > 1) {
      if (current > 0) {
        keyboard.text(
          '‹',
          encodeCallback({
            dialogId,
            step,
            action: 'page',
            payload: String(current - 1),
          }),
        )
      }
      keyboard.text(`${current + 1}/${pages}`, DIALOG_NOOP)
      if (current < pages - 1) {
        keyboard.text(
          '›',
          encodeCallback({
            dialogId,
            step,
            action: 'page',
            payload: String(current + 1),
          }),
        )
      }
      keyboard.row()
    }

    appendControls(keyboard, dialogId, step, options.optional)

    return {
      rendered: {
        text: options.prompt,
        keyboard,
        acceptsText: options.allowManual ?? false,
      },
      options: all,
    }
  },

  accept: (payload, _context, snapshot) => {
    const index = Number(payload)
    const choice = snapshot?.[index]

    // The list moved under the user (catalog refresh) — ask again.
    if (!choice) {
      return { status: 'retry', error: 'Список изменился, выберите заново' }
    }

    return { status: 'done', value: choice.code }
  },

  acceptText: options.allowManual
    ? (raw, context) =>
        options.parse?.(raw, context) ?? { status: 'done', value: raw.trim() }
    : undefined,
})

const cancelOnly = (dialogId: string, step: number): InlineKeyboard =>
  new InlineKeyboard().text(
    '✖ Отмена',
    encodeCallback({ dialogId, step, action: 'cancel', payload: '' }),
  )

const appendControls = (
  keyboard: InlineKeyboard,
  dialogId: string,
  step: number,
  optional?: boolean,
): void => {
  if (step > 0) {
    keyboard.text(
      '‹ Назад',
      encodeCallback({ dialogId, step, action: 'back', payload: '' }),
    )
  }
  if (optional) {
    keyboard.text(
      'Пропустить',
      encodeCallback({ dialogId, step, action: 'skip', payload: '' }),
    )
  }
  keyboard.text(
    '✖ Отмена',
    encodeCallback({ dialogId, step, action: 'cancel', payload: '' }),
  )
}
