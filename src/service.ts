import { providedCommands } from './commands/provider'
import { CommandRegistry } from './framework/commands/CommandRegistry'
import type { ListenContext } from './index'
import { listenTransport } from './transport'

const provideCommands = (context: ListenContext): void => {
  CommandRegistry.instance.enrich(providedCommands)
  CommandRegistry.instance.listen(context)
}

const provideTransportListener = (context: ListenContext): void => {
  listenTransport(context)
}

export const service = (context: ListenContext): void => {
  provideCommands(context)
  provideTransportListener(context)
}
