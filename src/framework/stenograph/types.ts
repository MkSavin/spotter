import type { StenographTransport } from './transport/StenographTransport'

export type StenographLevel = 'error' | 'warn' | 'info' | 'debug' | string

export type StenographRenderer = (message: StenographMessage) => void
export type StenographRenderRepository = Record<string, StenographRenderer>

export type StenographLevelDefinition = {
  name: StenographLevel
  icon?: string
  [key: string]: StenographRenderer | any
}
export type StenographLevelRepository = StenographLevelDefinition[]

export type StenographMessage = {
  level: StenographLevelDefinition
  group?: string
  prefix?: string
  content: string
  trace?: boolean
  pathParts: string[]
  [key: string]: any
}

export type StenographSimplifiedMessage = Omit<StenographMessage, 'level'> & {
  level: StenographLevel
}

export type StenographFormatter = (
  message: StenographMessage,
) => StenographMessage | boolean

export type StenographOptions = {
  path?: string | string[]
  levels?: StenographLevelRepository
  transport?: StenographTransport[]
  format?: StenographFormatter
}
