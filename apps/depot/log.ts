import {
  Stenograph,
  StenographConsole,
  type StenographLevelRepository,
  combineFormat,
  consoleRenderer,
  pathJoinFormat,
  prefixFormat,
} from 'stenograph'

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
