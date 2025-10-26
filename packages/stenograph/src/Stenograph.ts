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

  /**
   * Disable logging
   *
   * @returns this
   */
  disable(): this {
    this.enabled = false
    return this
  }

  /**
   * Enable logging
   *
   * @returns this
   */
  enable(): this {
    this.enabled = true
    return this
  }

  /**
   * Append path
   *
   * @param path
   */
  appendPath(path: string | string[]): this {
    this.pathParts =
      typeof path === 'string'
        ? [...this.pathParts, path]
        : [...this.pathParts, ...path]
    return this
  }

  /**
   * Create logger clone
   */
  clone(): Stenograph {
    return new Stenograph({
      path: this.pathParts,
      levels: this.levels,
      transport: this.transport,
      format: this.format,
    })
  }

  /**
   * Enable (or disable) tracing
   *
   * @param flag
   */
  trace(flag = true): this {
    this.gluedMessage.trace = flag
    return this
  }

  /**
   * Start group mode
   *
   * @param group
   */
  group(group?: string): this {
    this.gluedMessage.group = group
    return this
  }

  /**
   * End group mode
   */
  groupEnd(): this {
    this.gluedMessage.group = undefined
    return this
  }

  /**
   * Create child logger with new path definition
   *
   * @param path
   */
  sub(...path: string[]): Stenograph {
    return this.clone().appendPath(path)
  }

  /**
   * Find level definition
   *
   * @param level
   */
  findDefinition(
    level: StenographLevel,
  ): StenographLevelDefinition | undefined {
    return this.levels.find((definition) => definition.name === level)
  }

  /**
   * Append message data
   *
   * @param message
   */
  glue(message: StenographSimplifiedMessage): this {
    this.gluedMessage = message
    return this
  }

  /**
   * Perform message logging
   *
   * @param message
   */
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

  /**
   * Hide sensitive information
   *
   * @param value
   */
  sensitive(value: string): string {
    return `${value.at(0)} ${'#'.repeat(value.length - 2)} ${value.at(-1)}`
  }

  /**
   * Leveled log shorthand
   *
   * @param level
   * @param content
   * @private
   */
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
