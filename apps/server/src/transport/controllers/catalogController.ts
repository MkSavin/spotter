import {
  type StreamMessageController,
  bufferToJson,
  safeParseCatalog,
} from '@spotter/transport'
import type { ServerContext } from '../../context'

export const catalogController: StreamMessageController<ServerContext> = async (
  payload,
  context,
): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const snapshot = safeParseCatalog(value)
  if (!snapshot) return

  context.catalog.apply(snapshot)
}
