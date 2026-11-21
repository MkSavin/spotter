import type { CommandThrottle } from '@spotter/transport'
import type { BotContext } from '../../context'
import type { CommandMiddleware } from '../../middlewares/types'

export { CommandThrottle, THROTTLE_SWEEP_MS } from '@spotter/transport'

/** Rejects a repeat of the same command until its cooldown lapses. */
export const throttleGuard = (
  throttle: CommandThrottle,
  command: string,
  cooldownMs?: number,
): CommandMiddleware<BotContext> => {
  return async (context, next) => {
    const chatId = context.chatId
    if (!chatId) return next()

    const waitMs = throttle.remaining(String(chatId), command, cooldownMs)
    if (waitMs > 0) {
      return context.reply(
        `⏳ Слишком часто — попробуйте через ${Math.ceil(waitMs / 1000)} с`,
      )
    }

    throttle.mark(String(chatId), command)
    return next()
  }
}
