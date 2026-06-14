import type { HeartbeatProps } from '../context'

export const intervalHeartbeat = async (
  heartbeat: () => Promise<void>,
  context: HeartbeatProps,
  callback: () => Promise<void>,
): Promise<void> => {
  // Keep heartbeating for the ENTIRE duration of the callback. Previously a
  // setTimeout(context.timeout) cleared the interval early, so any work longer
  // than the timeout (e.g. video transcoding) stopped heartbeating and the
  // consumer got evicted from the group → reprocessing loops and duplicate sends.
  const intervalId = setInterval(heartbeat, context.heartbeat)

  try {
    await callback()
  } finally {
    clearInterval(intervalId)
    await heartbeat()
  }
}
