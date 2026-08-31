import type { InlineKeyboard } from 'grammy'
import type { BotContext } from '../context'

export type PromptOptions = {
  text: string
  keyboard?: InlineKeyboard
  /** Edit this message when set; otherwise a new one is sent. */
  messageId?: number
}

/**
 * Keeps the dialog on one message: edits in place, falling back to a fresh
 * message when the original is gone (deleted, or too old to edit).
 */
export const renderPrompt = async (
  context: BotContext,
  { text, keyboard, messageId }: PromptOptions,
): Promise<number | undefined> => {
  if (messageId && context.chatId) {
    try {
      await context.api.editMessageText(context.chatId, messageId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      return messageId
    } catch (error) {
      context.logger.debug(
        'Dialog prompt edit failed, sending a new one',
        error,
      )
    }
  }

  const sent = await context.replyWithHTML(text, { reply_markup: keyboard })
  return sent?.message_id
}

/** Clears the prompt once it is answered: the result speaks for itself. */
export const removePrompt = async (
  context: BotContext,
  messageId: number | undefined,
): Promise<void> => {
  if (!messageId || !context.chatId) return

  try {
    await context.api.deleteMessage(context.chatId, messageId)
  } catch (error) {
    context.logger.debug('Dialog prompt delete failed', error)
  }
}
