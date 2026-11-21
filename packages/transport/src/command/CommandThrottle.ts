/** Default gap between two runs of the same command in one chat. */
export const COMMAND_COOLDOWN_MS = 3_000

/**
 * How stale an entry must be before a sweep drops it. Above the longest
 * per-command cooldown, so a sweep never forgets a window still in force.
 */
export const THROTTLE_SWEEP_MS = 5 * 60_000

/**
 * Guards the NVR, not us, so it sits in front of every command. In memory on
 * purpose: a cooldown outliving a restart would punish the wrong request.
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
