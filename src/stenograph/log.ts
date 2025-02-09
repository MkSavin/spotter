import {StenographLevelRepository} from './types'
import {consoleRenderer, StenographConsole} from './transport/StenographConsole'
import {pathJoinFormat} from './format/pathJoinFormat'
import {prefixFormat} from './format/prefixFormat'
import {Stenograph} from './Stenograph'
import {combineFormat} from './format/combineFormat'

const levels: StenographLevelRepository = [
  {
    name: 'error',
    icon: '❌',
    console: consoleRenderer.error,
  },
  {
    name: 'warn',
    icon: '⚠️',
    console: consoleRenderer.warn,
  },
  {
    name: 'info',
    icon: 'ℹ️',
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

export const prefix = prefixFormat((message, oldPrefix) => (
  `${oldPrefix ? `${oldPrefix} ` : ''}[${message.path}] ${message.level.icon ?? message.level.name}`
))

export const logger = new Stenograph({
  levels,
  transport: [
    new StenographConsole({
      fromLevel: 'debug',
    }),
  ],
  format: combineFormat([
    pathJoin,
    prefix,
  ]),
})
