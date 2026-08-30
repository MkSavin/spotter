import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import type { Choice } from '../../dialog/types'
import { ROLE_TITLES } from '../../helpers/role'
import type { ArgSpec } from '../../middlewares/command/argument'

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
