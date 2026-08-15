import { combineFormat } from '../format/combineFormat'
import { prefixFormat } from '../format/prefixFormat'
import { Stenograph } from '../Stenograph'
import {
  consoleRenderer,
  StenographConsole,
} from '../transport/StenographConsole'
import type { StenographLevelRepository } from '../types'

const levels: StenographLevelRepository = [
  {
    name: 'error',
    icon: 'ERR',
    console: consoleRenderer.error,
  },
  {
    name: 'warn',
    icon: 'WRN',
    console: consoleRenderer.warn,
  },
  {
    name: 'info',
    icon: 'INF',
    console: consoleRenderer.info,
  },
  {
    name: 'verbose',
    icon: 'VRB',
    console: consoleRenderer.info,
  },
  {
    name: 'debug',
    icon: 'DBG',
    console: consoleRenderer.debug,
  },
]

export const baseInliner = prefixFormat(
  (message) => `${message.level.icon ?? message.level.name} ${message.content}`,
)

const logger = new Stenograph({
  path: 'API',
  levels,
  transport: [new StenographConsole()],
  format: combineFormat([baseInliner]),
})

logger.sub('test')
