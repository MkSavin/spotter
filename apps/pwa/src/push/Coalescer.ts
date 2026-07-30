import { eventCode } from '@spotter/transport'
import type { PwaDatabase } from '../db/client'
import type { PushGateway } from '../push/PushGateway'
import {
  type NotificationPayload,
  renderBurstNotification,
} from '../render/notification'
import { type DispatchDeps, dispatchNotification } from './dispatch'

export type CoalescerDeps = DispatchDeps & { coalesceMs: number }

type Window = {
  cameraLabel: string
  count: number
  timer: ReturnType<typeof setTimeout>
}

/**
 * Storm guard: the first event on a camera is pushed immediately; further
 * events on the same camera within `coalesceMs` are counted, and on flush a
 * single collapsed "N событий" push replaces the burst on the device (same
 * `topic`). Keeps a busy camera from firing a notification per frame.
 */
export class PushCoalescer {
  private readonly windows = new Map<string, Window>()

  constructor(private readonly deps: CoalescerDeps) {}

  /**
   * Pushes `payload` for the event, or folds it into an open window for the
   * camera. Returns whether an immediate push was dispatched (first in window).
   */
  async push(
    eventId: string,
    camera: string,
    cameraLabel: string,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const open = this.windows.get(camera)
    if (open) {
      open.count += 1
      return false
    }

    this.windows.set(camera, {
      cameraLabel,
      count: 1,
      timer: setTimeout(() => this.flush(camera), this.deps.coalesceMs),
    })

    await dispatchNotification(this.deps, payload, eventCode(eventId))
    return true
  }

  private async flush(camera: string): Promise<void> {
    const window = this.windows.get(camera)
    if (!window) return
    this.windows.delete(camera)

    if (window.count > 1) {
      await dispatchNotification(
        this.deps,
        renderBurstNotification(window.cameraLabel, window.count),
        `burst-${camera}`.slice(0, 32),
      )
    }
  }

  stop(): void {
    for (const window of this.windows.values()) clearTimeout(window.timer)
    this.windows.clear()
  }
}
