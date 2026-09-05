import { type CommandReply, trySendCommand } from '@spotter/transport'
import type { BotContext } from '../../context'

/**
 * Sends a domain command on the sender's behalf and answers the two failures
 * every caller shares: an unreachable server and a plain refusal.
 *
 * Returns the reply's data only when the domain said yes, so a caller that
 * forgets to check cannot mistake a refusal for a result. A caller needing the
 * refusal itself — to phrase `not-found` its own way — passes `onRefusal`.
 */
export const askDomain = async (
  context: BotContext,
  kind: string,
  args: Record<string, unknown> = {},
  onRefusal?: (reply: CommandReply) => Promise<boolean>,
): Promise<CommandReply | undefined> => {
  const outcome = await trySendCommand(
    context.commandBus,
    kind,
    args,
    context.session.user.recipientUuid,
  )

  if (!outcome.reached) {
    await context.reply('Сервис временно недоступен.')
    return undefined
  }

  const { reply } = outcome
  if (reply.ok) return reply

  if (await onRefusal?.(reply)) return undefined

  await context.reply(`Ошибка: ${reply.error}`)
  return undefined
}
