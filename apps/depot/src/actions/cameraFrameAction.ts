import type { CoreContext } from '../context'
import type { ProcessFileContext } from '../processing/processFile'
import { processImage } from '../processing/processImage'

export type CameraFramePayload = {
  cameraCode: string
  chatId?: string
  messageId?: number
  frameUrl?: string
  endpointAuthorization?: string
}

type CameraFrameResult = {
  cameraCode: string
  frameUrl: string
  chatId: string | undefined
  messageId: number | undefined
}

export const cameraFrameAction = async (
  payload: CameraFramePayload,
  context: CoreContext,
): Promise<CameraFrameResult | undefined> => {
  const { cameraCode, frameUrl: rawFrameUrl } = payload

  try {
    context.logger.info('Starting to perform camera frame conversion')

    const processingContext: ProcessFileContext = {
      ...context,
      ...payload,
      bucket: 'camera-media',
      filePrefix: `camera-${cameraCode}`,
    }

    context.logger.verbose('Action contents:', payload)

    const frameUrl = await processImage(rawFrameUrl, processingContext).catch(
      (error) => {
        context.logger.error(error)
        return undefined
      },
    )

    if (!frameUrl) {
      return undefined
    }

    context.logger.info('Media successfully converted: frame')

    return {
      cameraCode,
      frameUrl,
      chatId: payload.chatId,
      messageId: payload.messageId,
    }
  } catch (error) {
    context.logger.error(error)
  }

  return undefined
}
