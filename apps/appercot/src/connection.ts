import { BotConnection } from '@appercot/chat'
import type { BotMethod, Params, Result } from '@appercot/protocol'

const RPC_DEADLINE_MS = 20_000

/** Bound the SDK's wait for a handshake as well as its sent RPCs. */
export class AppercotConnection extends BotConnection {
  override async call<Method extends BotMethod>(
    method: Method,
    params: Params<Method>,
  ): Promise<Result<Method>> {
    const timeout = setTimeout(() => this.stop(), RPC_DEADLINE_MS)
    try {
      return await super.call(method, params)
    } finally {
      clearTimeout(timeout)
    }
  }
}
