import type { Bot } from 'grammy'
import type { BotApi, BotContext } from '../context'
import {
  DIALOG_NOOP,
  decodeCallback,
  dialogCallbackPattern,
} from './callbackData'
import {
  activeDialog,
  applyResult,
  clearDialog,
  show,
  skipStep,
  stepBack,
} from './Dialog'
import type { DialogDefinition } from './types'

/**
 * Routes `dlg:` callbacks and text replies into the running dialog. One
 * registry owns every dialog in the bot, so stale keyboards are recognised in
 * a single place rather than by each command.
 */
export class DialogRegistry {
  private readonly definitions = new Map<string, DialogDefinition>()

  register(definition: DialogDefinition): this {
    this.definitions.set(definition.kind, definition)
    return this
  }

  get(kind: string): DialogDefinition | undefined {
    return this.definitions.get(kind)
  }

  /** Inline-button answers. Register before the catch-all command handler. */
  callbacks(bot: Bot<BotContext, BotApi>): void {
    bot.callbackQuery(dialogCallbackPattern, async (context) => {
      const raw = context.callbackQuery.data ?? ''

      // The page counter is a label, not a control.
      if (raw === DIALOG_NOOP) {
        await context.answerCallbackQuery()
        return
      }

      const data = decodeCallback(raw)
      const state = activeDialog(context)

      // A keyboard from a finished or superseded dialog.
      if (!data || !state || data.dialogId !== state.id) {
        await context.answerCallbackQuery({ text: 'Диалог устарел' })
        return
      }

      const definition = this.definitions.get(state.kind)
      if (!definition) {
        clearDialog(context)
        await context.answerCallbackQuery({ text: 'Диалог устарел' })
        return
      }

      await context.answerCallbackQuery()

      // A tap on a stale step index would answer the wrong question.
      if (data.step !== state.step) return

      switch (data.action) {
        case 'cancel':
          await applyResult(context, definition, state, { status: 'cancel' })
          return
        case 'back':
          await stepBack(context, definition, state)
          return
        case 'skip':
          await skipStep(context, definition, state)
          return
        case 'page':
          state.page = Number(data.payload) || 0
          await show(context, definition, state)
          return
        case 'pick': {
          const step = definition.steps[state.step]
          if (!step.accept) return
          const result = await step.accept(data.payload, context, state.options)
          await applyResult(context, definition, state, result)
        }
      }
    })
  }

  /**
   * Text answers. Must run before `registerUnknownCommand`, which otherwise
   * swallows the reply, and must ignore commands so `/status` mid-dialog stays
   * a command instead of becoming an answer.
   */
  input(bot: Bot<BotContext, BotApi>): void {
    bot.chatType('private').on('message:text', async (context, next) => {
      const state = activeDialog(context)
      if (!state) return next()

      const definition = this.definitions.get(state.kind)
      if (!definition) {
        clearDialog(context)
        return next()
      }

      // A new command abandons the dialog rather than answering it.
      if (context.message.text.startsWith('/')) {
        clearDialog(context)
        return next()
      }

      const step = definition.steps[state.step]

      // A step that only takes buttons still owes the user an answer: dropping
      // the message silently makes the dialog look frozen.
      if (!step.acceptText) {
        await applyResult(context, definition, state, {
          status: 'retry',
          error: 'Выберите вариант кнопкой',
        })
        return
      }

      const result = await step.acceptText(context.message.text, context)
      await applyResult(context, definition, state, result)
    })
  }
}
