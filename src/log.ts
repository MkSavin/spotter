import { Stenograph } from './framework/stenograph/Stenograph'
import { combineFormat } from './framework/stenograph/format/combineFormat'
import { pathJoinFormat } from './framework/stenograph/format/pathJoinFormat'
import { prefixFormat } from './framework/stenograph/format/prefixFormat'
import {
  StenographConsole,
  consoleRenderer,
} from './framework/stenograph/transport/StenographConsole'
import type { StenographLevelRepository } from './framework/stenograph/types'

const levels: StenographLevelRepository = [
  {
    name: 'error',
    icon: '❌',
    console: consoleRenderer.error,
  },
  {
    name: 'warn',
    // /!\ - biome replaces with incorrect char
    icon: '\u{26a0}\u{fe0f}',
    console: consoleRenderer.warn,
  },
  {
    name: 'info',
    // [i] - biome replaces with incorrect char
    icon: '\u{2139}\u{fe0f}',
    console: consoleRenderer.info,
  },
  {
    name: 'verbose',
    icon: '📙',
    console: consoleRenderer.info,
  },
  {
    name: 'debug',
    icon: '🐞',
    console: consoleRenderer.debug,
  },
]

export const pathJoin = pathJoinFormat(' » ')

export const prefix = prefixFormat(
  (message, oldPrefix) =>
    `${oldPrefix ? `${oldPrefix} ` : ''}[${message.path}] ${message.level.icon ?? message.level.name}`,
)

export const logger = new Stenograph({
  levels,
  transport: [
    new StenographConsole({
      fromLevel: 'debug',
    }),
  ],
  format: combineFormat([pathJoin, prefix]),
})
