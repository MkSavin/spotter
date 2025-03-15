import { Stenograph } from './Stenograph'
import { combineFormat } from './format/combineFormat'
import { pathJoinFormat } from './format/pathJoinFormat'
import { prefixFormat } from './format/prefixFormat'
import {
  StenographConsole,
  consoleRenderer,
} from './transport/StenographConsole'
import type { StenographLevelRepository } from './types'

export const defaultLogLevels: StenographLevelRepository = [
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

export const defaultLogger = new Stenograph({
  levels: defaultLogLevels,
  transport: [
    new StenographConsole({
      fromLevel: 'debug',
    }),
  ],
  format: combineFormat([
    pathJoinFormat(' » '),
    prefixFormat(
      (message, oldPrefix) =>
        `${oldPrefix ? `${oldPrefix} ` : ''}[${message.path}] ${message.level.icon ?? message.level.name}`,
    ),
  ]),
})
