import { parsedController, safeParseHeartbeat } from '@spotter/transport'
import type { TransportContext } from '../../context'

export const heartbeatController = parsedController(
  safeParseHeartbeat,
  async (beat, context: TransportContext) => {
    context.heartbeats.apply(beat)
    context.rollouts.apply(beat)
    context.sources.apply(beat)
  },
)
