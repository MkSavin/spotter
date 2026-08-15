import {
  bufferToJson,
  type StreamMessageController,
  safeParseCatalog,
} from '@spotter/transport'
import type { TransportContext } from '../../context'

export const catalogController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const snapshot = safeParseCatalog(value)
  if (!snapshot) return

  context.catalog.apply(snapshot)
}
