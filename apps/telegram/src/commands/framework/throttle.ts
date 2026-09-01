import type { BotContext } from '../../context'
import type { CommandMiddleware } from '../../middlewares/types'

/** Default gap between two runs of the same command in one chat. */
export const COMMAND_COOLDOWN_MS = 3_000

/**
 * How stale an entry must be before a sweep drops it. Above the longest
 * per-command cooldown, so a sweep never forgets a window still in force.
 */
export const THROTTLE_SWEEP_MS = 5 * 60_000

/**
 * Per-chat command cooldown.
 *
 * The pipeline's slow parts are the NVR and ffmpeg, not us: a held-down
 * `/camera_snapshot` costs the camera far more than it costs the bot. The gate
 * therefore protects the NVR, which is why it lives in front of every command
 * rather than inside the ones that happen to be expensive.
 *
 * Deliberately in memory: this smooths a person leaning on a button, and a
 * cooldown that outlives a restart would punish the wrong request.
 */
export class CommandThrottle {
  private readonly last = new Map<string, number>()

  constructor(private readonly cooldownMs: number = COMMAND_COOLDOWN_MS) {}

  /** Milliseconds still to wait, or 0 when the command may run now. */
  remaining(
    chatId: string,
    command: string,
    cooldownMs = this.cooldownMs,
    now = Date.now(),
  ): number {
    const previous = this.last.get(`${chatId}:${command}`)
    if (previous === undefined) return 0
    return Math.max(0, cooldownMs - (now - previous))
  }

  /** Records a run; call only once the command is actually allowed through. */
  mark(chatId: string, command: string, now = Date.now()): void {
    this.last.set(`${chatId}:${command}`, now)
  }

  /**
   * Drops entries whose cooldown has lapsed, so the map cannot grow forever.
   * `maxCooldownMs` must cover the longest per-command override in play.
   */
  sweep(maxCooldownMs = this.cooldownMs, now = Date.now()): number {
    let removed = 0
    for (const [key, at] of this.last) {
      if (now - at >= maxCooldownMs) {
        this.last.delete(key)
        removed += 1
      }
    }
    return removed
  }

  get size(): number {
    return this.last.size
  }
}

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
