import { parsedController, safeParseHeartbeat } from '@spotter/transport'
import type { TransportContext } from '../../context'

/** Keeps the status screen's view of every service current. */
export const heartbeatController = parsedController(
  safeParseHeartbeat,
  async (beat, context: TransportContext) => {
    context.heartbeats.apply(beat)
  },
)
