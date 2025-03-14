import type { HeartbeatProps } from '../context'

export const intervalHeartbeat = async (
  heartbeat: () => Promise<void>,
  context: HeartbeatProps,
  callback: () => Promise<void>,
): Promise<void> => {
  const intervalId = setInterval(heartbeat, context.heartbeat)
  const timeoutId = setTimeout(() => clearInterval(intervalId), context.timeout)

  try {
    await callback()
  } finally {
    await heartbeat()
    // remove timers
    clearTimeout(timeoutId)
    clearInterval(intervalId)
  }
}
