import {
  bufferToJson,
  probeStreams,
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

  // Always answered, refusal included: an unanswered `/test` looks exactly
  // like the outage it exists to detect, and the caller would wait for an
  // event that is never coming.
  await context.producer.publish(probeStreams.result, {
    source: request.source,
    ...(request.chatId !== undefined ? { chatId: request.chatId } : {}),
    ...(outcome.staged
      ? { staged: true, camera: outcome.camera, frames: outcome.frames }
      : { staged: false, reason: outcome.reason }),
  })

  if (!outcome.staged) {
    logger.warn(`Probe request refused: ${outcome.reason}`)
    return
  }

  // No event is published here: the NVR publishes it, and whether it does is
  // exactly what the caller is testing.
  logger.info(
    `Staged a ${request.label} on ${outcome.camera} for ${outcome.frames} frames`,
  )
}
