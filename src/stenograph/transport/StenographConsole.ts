/* eslint-disable no-console */
import { Stenograph } from '../Stenograph'
import { StenographMessage, StenographRenderer, StenographRenderRepository } from '../types'
import { StenographTransport, StenographTransportOptions } from './StenographTransport'

export class StenographConsole extends StenographTransport {
  gluedAppendix: Partial<StenographMessage>|undefined

  constructor(
    options?: StenographTransportOptions
      & { gluedAppendix?: Partial<StenographMessage>, },
  ) {
    super(options)
    this.gluedAppendix = options?.gluedAppendix
  }

  protected log(_: Stenograph, message: StenographMessage): void {
    const renderer = message.level.console as StenographRenderer|undefined

    if (!renderer) {
      return
    }

    renderer({ ...message, ...this.gluedAppendix })
  }
}

const inlineContent = (message: StenographMessage): any[] => (
  [
    message.prefix,
    ...message.content,
  ].filter(Boolean)
)

const baseRenderer = (out: (...data: any[]) => void, message: StenographMessage): void => {
  if (message.group) {
    console.group(message.group)
  }

  out(...inlineContent(message))

  if (message.trace) {
    console.trace()
  }

  if (message.group) {
    console.groupEnd()
  }
}

export const consoleRenderer: StenographRenderRepository = {
  error: (message: StenographMessage): void => baseRenderer(console.error, message),
  warn: (message: StenographMessage): void => baseRenderer(console.warn, message),
  info: (message: StenographMessage): void => baseRenderer(console.info, message),
  debug: (message: StenographMessage): void => baseRenderer(console.debug, message),
}
