import type { StenographFormatter } from '../types'

export const combineFormat =
  (formatters: StenographFormatter[]): StenographFormatter =>
  (message) => {
    let skipMessage = false
    let currentMessage = { ...message }
    formatters.forEach((formatter) => {
      const result = formatter(currentMessage)

      if (result === false) {
        skipMessage = true
        return
      }

      if (result === true || result === undefined) {
        return
      }

      currentMessage = { ...result }
    })

    if (skipMessage) {
      return false
    }

    return currentMessage
  }
