import { bufferToJson } from '../helpers/bufferToJson'
import type {
  StreamMessageController,
  StreamMessagePayload,
} from './RedisRegulator'

/**
 * Wraps a controller in the decode-and-validate step every stream needs:
 * payloads that are not JSON, or that fail the schema, are dropped before the
 * handler runs. Adapters publish malformed messages often enough that this
 * guard is the rule, and writing it by hand makes forgetting it possible.
 *
 * Dropping beats retrying here — a body that is not JSON will not become JSON
 * on the fifth delivery, and letting it through would spend the poison budget
 * before reaching the dead-letter stream.
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
