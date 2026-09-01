import {
  bufferToJson,
  type StreamMessageController,
  safeParseHeartbeat,
} from '@spotter/transport'
import type { TransportContext } from '../../context'

/** Keeps the status screen's view of every service current. */
export const heartbeatController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const beat = safeParseHeartbeat(value)
  if (!beat) return

  context.heartbeats.apply(beat)
}
