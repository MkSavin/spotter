import { bufferToJson } from '../helpers/bufferToJson'
import type {
  StreamMessageController,
  StreamMessagePayload,
} from './RedisRegulator'

/**
 * Dropped rather than retried: a body that is not JSON will not become JSON
 * on the fifth delivery, and retrying spends the poison budget.
 */
export const parsedController =
  <Value, Context>(
    parse: (value: unknown) => Value | null | undefined,
    handle: (
      value: Value,
      context: Context,
      payload: StreamMessagePayload,
    ) => Promise<void>,
  ): StreamMessageController<Context> =>
  async (payload, context) => {
    let value: unknown
    try {
      value = bufferToJson(payload.message.value)
    } catch {
      return
    }
    if (!value) return

    const parsed = parse(value)
    if (!parsed) return

    await handle(parsed, context, payload)
  }
