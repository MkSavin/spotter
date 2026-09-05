import type { CommandReply } from '@spotter/transport'
import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import type { Choice } from '../../dialog/types'
import { escapeHtml } from '../../helpers/html'
import { ROLE_TITLES } from '../../helpers/role'
import type { ArgSpec } from '../../middlewares/command/argument'

/**
 * Names the user the domain could not find, rather than echoing `not-found`.
 * Handles only that refusal; anything else falls through to the generic reply.
 */
export const userNotFound =
  (context: BotContext, ref: string) =>
  async (reply: CommandReply): Promise<boolean> => {
    if (reply.error !== 'not-found') return false

    await context.replyWithHTML(
      `🔍 <b>Пользователь <code>${escapeHtml(ref)}</code> не найден</b>`,
    )
    return true
  }

/** Known users, so the common case is a tap instead of typing a handle. */
const knownUsers = (context: BotContext): Choice[] =>
  tgBindingsRepo.list(context.db).map((binding) => ({
    code: binding.username ?? binding.tgUserId,
    label: binding.username ? `@${binding.username}` : `#${binding.tgUserId}`,
  }))

/** The `@username | id` argument shared by the user_* commands. */
export const userRefArg = (prompt: string): ArgSpec => ({
  name: 'ref',
  hint: '@username | id',
  prompt,
  choices: knownUsers,
  emptyPrompt: `${prompt}\n\nВведите <code>@username</code> или числовой id.`,
  allowManual: true,
})

export const roleArg: ArgSpec = {
  name: 'role',
  hint: 'viewer|user|admin',
  prompt: '🆙 <b>Выберите роль</b>',
  choices: () =>
    Object.entries(ROLE_TITLES).map(([code, label]) => ({ code, label })),
  allowManual: true,
  parse: (raw) => {
    const upper = raw.trim().toUpperCase()
    return upper in ROLE_TITLES
      ? { status: 'done', value: upper }
      : { status: 'retry', error: 'Неизвестная роль' }
  },
}
