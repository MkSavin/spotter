import type { StenographTransport } from './transport/StenographTransport'
import type {
  StenographFormatter,
  StenographLevel,
  StenographLevelDefinition,
  StenographLevelRepository,
  StenographMessage,
  StenographOptions,
  StenographSimplifiedMessage,
} from './types'

export class Stenograph {
  pathParts: string[] = []

  levels: StenographLevelRepository = []
  transport: StenographTransport[] = []
  format: StenographFormatter | undefined = undefined

  enabled = true

  gluedMessage: Partial<StenographSimplifiedMessage> = {}

  constructor(options: StenographOptions) {
    if (options.path) {
      this.pathParts =
        typeof options.path === 'string' ? [options.path] : options.path
    }

    this.levels = options.levels ?? []
    this.transport = options.transport ?? []
    this.format = options.format
  }

  disable(): this {
    this.enabled = false
    return this
  }

  enable(): this {
    this.enabled = true
    return this
  }

  appendPath(path: string | string[]): this {
    this.pathParts =
      typeof path === 'string'
        ? [...this.pathParts, path]
        : [...this.pathParts, ...path]
    return this
  }

  clone(): Stenograph {
    const cloned = new Stenograph({
      path: this.pathParts,
      levels: this.levels,
      transport: this.transport,
      format: this.format,
    })
    // Children must inherit the enabled state — otherwise disabling a root
    // logger (e.g. during tests) leaves every `.sub()` child still logging.
    cloned.enabled = this.enabled
    return cloned
  }

  trace(flag = true): this {
    this.gluedMessage.trace = flag
    return this
  }

  group(group?: string): this {
    this.gluedMessage.group = group
    return this
  }

  groupEnd(): this {
    this.gluedMessage.group = undefined
    return this
  }

  sub(...path: string[]): Stenograph {
    return this.clone().appendPath(path)
  }

  findDefinition(
    level: StenographLevel,
  ): StenographLevelDefinition | undefined {
    return this.levels.find((definition) => definition.name === level)
  }

  glue(message: StenographSimplifiedMessage): this {
    this.gluedMessage = message
    return this
  }

  message(message: StenographSimplifiedMessage): this {
    const definition = this.findDefinition(message.level)

    if (
      !this.enabled ||
      !this.format ||
      this.transport.length === 0 ||
      !definition
    ) {
      return this
    }

    const formatted = this.format({
      ...this.gluedMessage,
      ...message,
      pathParts: this.pathParts,
      level: definition,
    } as StenographMessage)

    if (typeof formatted === 'boolean') {
      return this
    }

    this.transport.forEach((transport) => {
      transport.push(this, formatted)
    })

    return this
  }

  sensitive(value: string): string {
    return `${value.at(0)} ${'#'.repeat(value.length - 2)} ${value.at(-1)}`
  }

  private logShorthand(level: StenographLevel, content: any[] = []): this {
    return this.message({
      level,
      content,
    })
  }

  log = (level: StenographLevel, ...content: any[]): this =>
    this.logShorthand(level, content)
  error = (...content: any[]): this => this.logShorthand('error', content)
  warn = (...content: any[]): this => this.logShorthand('warn', content)
  info = (...content: any[]): this => this.logShorthand('info', content)
  verbose = (...content: any[]): this => this.logShorthand('verbose', content)
  debug = (...content: any[]): this => this.logShorthand('debug', content)
}
