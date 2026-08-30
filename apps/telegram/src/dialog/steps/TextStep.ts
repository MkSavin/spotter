import { InlineKeyboard } from 'grammy'
import type { BotContext } from '../../context'
import { encodeCallback } from '../callbackData'
import type { Step, StepResult } from '../types'

export type TextStepOptions = {
  name: string
  prompt: string
  optional?: boolean
  parse?: (raw: string, context: BotContext) => StepResult
}

export const textStep = (options: TextStepOptions): Step => ({
  name: options.name,
  optional: options.optional,

  render: async (_context, { dialogId, step }) => {
    const keyboard = new InlineKeyboard()

    if (step > 0) {
      keyboard.text(
        '‹ Назад',
        encodeCallback({ dialogId, step, action: 'back', payload: '' }),
      )
    }
    if (options.optional) {
      keyboard.text(
        'Пропустить',
        encodeCallback({ dialogId, step, action: 'skip', payload: '' }),
      )
    }
    keyboard.text(
      '✖ Отмена',
      encodeCallback({ dialogId, step, action: 'cancel', payload: '' }),
    )

    return {
      rendered: { text: options.prompt, keyboard, acceptsText: true },
    }
  },

  acceptText: (raw, context) => {
    const value = raw.trim()

    if (!value) {
      return { status: 'retry', error: 'Пустое значение, попробуйте ещё раз' }
    }

    return options.parse?.(value, context) ?? { status: 'done', value }
  },
})
