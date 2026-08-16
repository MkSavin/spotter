import {
  bufferToJson,
  type StreamMessageController,
  safeParseHeartbeat,
} from '@spotter/transport'
import type { TransportContext } from '../../context'

export const heartbeatController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const beat = safeParseHeartbeat(value)
  if (!beat) return

  context.heartbeats.apply(beat)
}
