import {
  bufferToJson,
  type StreamMessageController,
  safeParseProbeRequest,
} from '@spotter/transport'
import type { CoreContext } from '../../context'
import { probeAction } from '../actions/probeAction'

export const probeController: StreamMessageController<CoreContext> = async (
  payload,
  context,
) => {
  const { topic, message } = payload
  const logger = context.logger.sub('action', topic)

  const value = bufferToJson(message.value)
  if (!value) return

  const request = safeParseProbeRequest(value)
  if (!request) {
    logger.warn('Ignoring a malformed probe request')
    return
  }

  const outcome = await probeAction(context.config, request, logger)

  if (!outcome.staged) {
    logger.warn(`Probe request refused: ${outcome.reason}`)
    return
  }

  // Nothing is published here on purpose: the NVR publishes the event, and
  // whether it does is exactly what the caller is testing.
  logger.info(
    `Staged a ${request.label} on ${outcome.camera} for ${outcome.frames} frames`,
  )
}
