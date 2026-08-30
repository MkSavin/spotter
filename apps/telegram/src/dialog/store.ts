import type { BotContext } from '../context'
import { dialogStatesRepo } from '../db/repository'
import type { DialogState } from './types'

/**
 * Persists dialogs so a bot restart does not throw away a half-answered
 * wizard. The session is in-memory, so SQLite is the durable copy and the
 * session field is the per-request cache in front of it.
 */
const keyOf = (
  context: BotContext,
): { tgUserId: string; tgChatId: string } | undefined => {
  const tgUserId = context.from?.id?.toString()
  const tgChatId = context.chatId?.toString()
  return tgUserId && tgChatId ? { tgUserId, tgChatId } : undefined
}

/** Reads the stored dialog into the session on the first touch of a request. */
export const loadDialog = (context: BotContext): DialogState | undefined => {
  if (context.session.user.dialog) return context.session.user.dialog

  const key = keyOf(context)
  if (!key) return undefined

  try {
    const row = dialogStatesRepo.find(context.db, key.tgUserId, key.tgChatId)
    if (!row) return undefined

    const state = JSON.parse(row.state) as DialogState
    context.session.user.dialog = state
    return state
  } catch (error) {
    // A shape change between releases must not wedge the user in a bad row.
    context.logger.warn('Dropping unreadable dialog state', error)
    dropDialog(context)
    return undefined
  }
}

/** Durability is a bonus: a storage failure must not break the conversation. */
const guard = (context: BotContext, what: string, run: () => void): void => {
  try {
    run()
  } catch (error) {
    context.logger.warn(`Dialog ${what} failed`, error)
  }
}

export const saveDialog = (context: BotContext, state: DialogState): void => {
  const key = keyOf(context)
  if (!key) return

  guard(context, 'save', () =>
    dialogStatesRepo.save(
      context.db,
      key.tgUserId,
      key.tgChatId,
      JSON.stringify(state),
    ),
  )
}

export const dropDialog = (context: BotContext): void => {
  const key = keyOf(context)
  if (!key) return

  guard(context, 'drop', () =>
    dialogStatesRepo.remove(context.db, key.tgUserId, key.tgChatId),
  )
}
