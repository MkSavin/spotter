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
    icon: '\x1b[31mERROR\x1b[0m',
    console: consoleRenderer.error,
  },
  {
    name: 'warn',
    // /!\ - biome replaces with incorrect char
    icon: '\x1b[33mWARN \x1b[0m',
    console: consoleRenderer.warn,
  },
  {
    name: 'info',
    // [i] - biome replaces with incorrect char
    icon: '\x1b[34mINFO \x1b[0m',
    console: consoleRenderer.info,
  },
  {
    name: 'verbose',
    icon: '\x1b[35mVERBS\x1b[0m',
    console: consoleRenderer.info,
  },
  {
    name: 'debug',
    icon: '\x1b[36mDEBUG\x1b[0m',
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
        `${message.level.icon ?? message.level.name} ${oldPrefix ? `${oldPrefix} ` : ''}[${message.path || '~'}]`,
    ),
  ]),
})
