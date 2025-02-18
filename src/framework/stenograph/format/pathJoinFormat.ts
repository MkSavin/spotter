import type { StenographFormatter } from '../types'

export const pathJoinFormat =
  (splitter: string): StenographFormatter =>
  (message) => ({
    ...message,
    path: message.pathParts.join(splitter),
  })
