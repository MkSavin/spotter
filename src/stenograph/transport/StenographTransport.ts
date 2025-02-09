import { Stenograph } from '../Stenograph'
import { StenographLevel, StenographMessage } from '../types'

export type StenographTransportOptions = {
  fromLevel?: StenographLevel,
}

export abstract class StenographTransport {
  fromLevel: StenographLevel|undefined

  protected constructor(options?: StenographTransportOptions) {
    this.fromLevel = options?.fromLevel
  }

  /**
   * Push message to transport
   *
   * @param stenograph
   * @param message
   * @protected
   */
  public push(
    stenograph: Stenograph,
    message: StenographMessage,
  ): void {
    if (!this.testMessageLevel(stenograph, message)) {
      return
    }

    this.log(stenograph, message)
  }

  protected abstract log(
    stenograph: Stenograph,
    message: StenographMessage,
  ): void

  /**
   * Test message level
   *
   * @param stenograph
   * @param message
   * @protected
   */
  protected testMessageLevel(
    stenograph: Stenograph,
    message: StenographMessage,
  ): boolean {
    if (!this.fromLevel) {
      return true
    }

    const fromLevelIndex = stenograph.levels
      .findIndex((level) => level.name === this.fromLevel)
    const messageLevelIndex = stenograph.levels
      .findIndex((level) => level.name === message.level.name)

    return messageLevelIndex <= fromLevelIndex
  }
}
