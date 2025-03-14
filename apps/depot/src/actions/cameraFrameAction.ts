import path from 'node:path'
import type { CoreContext } from '../context'
import { processImage } from '../processing/processImage'

export type CameraFramePayload = {
  cameraCode: string
  frameUrl?: string
  endpointAuthorization?: string
}

type CameraFrameResult = {
  cameraCode: string
  framePath: string
}

export const cameraFrameAction = async (
  payload: CameraFramePayload,
  context: CoreContext,
): Promise<CameraFrameResult | undefined> => {
  const { cameraCode, frameUrl } = payload

  try {
    context.logger.info('Starting to perform camera frame conversion')

    const processingContext = {
      ...context,
      ...payload,
      filePrefix: `camera-${cameraCode}`,
    }

    context.logger.verbose('Action contents:', payload)

    const framePath = await processImage(frameUrl, processingContext).catch(
      (error) => {
        context.logger.error(error)
        return undefined
      },
    )

    if (!framePath) {
      return undefined
    }

    context.logger.info('Media successfully converted: frame')

    const destination = context.directory.destination.directory

    return {
      cameraCode,
      framePath: path.relative(destination, framePath),
    }
  } catch (error) {
    context.logger.error(error)
  }

  return undefined
}
