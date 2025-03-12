import { env } from './env'

export const actionInterval = env.number('ACTION_HEARTBEAT', 3000)
export const actionTimeout = env.number('ACTION_TIMEOUT', 30000)

export const intervalHeartbeat = async (
  heartbeat: () => Promise<void>,
  callback: () => Promise<void>,
): Promise<void> => {
  const intervalId = setInterval(heartbeat, actionInterval)
  const timeoutId = setTimeout(() => clearInterval(intervalId), actionTimeout)

  try {
    await callback()
  } finally {
    await heartbeat()
    // remove timers
    clearTimeout(timeoutId)
    clearInterval(intervalId)
  }
}
