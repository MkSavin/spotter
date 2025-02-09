import { StenographFormatter, StenographMessage } from '../types'

export type StenographPrefixInliner = (
  message: StenographMessage,
  oldPrefix?: string,
) => string|undefined|boolean

export const prefixFormat = (inliner: StenographPrefixInliner): StenographFormatter => (
  (message) => {
    const result = inliner(message, message.prefix)

    if (typeof result === 'string' || result === undefined) {
      return {
        ...message,
        prefix: result,
      }
    }

    return result
  }
)
