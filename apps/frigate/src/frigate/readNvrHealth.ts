import type { CoreConfig } from '../config'
import { frigateAuthHeaders, frigateUrls, settleUrl } from './frigateClient'

/** One camera as the NVR itself reports it. */
export type CameraHealth = {
  camera: string
  /** Frames the NVR is pulling from the stream. Zero means no video at all. */
  cameraFps: number
  /** Frames reaching the detector. Zero with video means detection is stalled. */
  detectionFps: number
  detectionEnabled: boolean
}

export type NvrHealth =
  | { state: 'ok'; cameras: CameraHealth[] }
  | { state: 'unknown'; reason: string }

/** Cameras with detection on that are not producing frames. */
export const deadCameras = (cameras: CameraHealth[]): CameraHealth[] =>
  cameras.filter((camera) => camera.detectionEnabled && camera.cameraFps === 0)

/**
 * Cameras receiving video the detector never sees.
 *
 * Distinct from a dead camera: the stream is fine and the NVR looks busy, but
 * nothing is being detected, so no event will ever be produced.
 */
export const stalledCameras = (cameras: CameraHealth[]): CameraHealth[] =>
  cameras.filter(
    (camera) =>
      camera.detectionEnabled &&
      camera.cameraFps > 0 &&
      camera.detectionFps === 0,
  )

/**
 * Asks the NVR how its cameras are actually doing.
 *
 * Being connected to the broker says nothing about whether the NVR has video:
 * a camera whose stream drops leaves the adapter healthy, the API answering and
 * the UI working, while no event can possibly be produced. The NVR knows within
 * seconds; without reading this, we only find out by noticing hours of silence.
 *
 * A camera with detection switched off is not a fault — it is a choice, and
 * reporting it would train the reader to ignore the warning.
 */
export const readNvrHealth = async (config: CoreConfig): Promise<NvrHealth> => {
  try {
    const response = await fetch(
      settleUrl(frigateUrls.stats, config.frigate.remoteUrl),
      {
        headers: frigateAuthHeaders(config.frigate),
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!response.ok) {
      return {
        state: 'unknown',
        reason: `/api/stats returned ${response.status}`,
      }
    }

    const body = (await response.json()) as {
      cameras?: Record<
        string,
        {
          camera_fps?: number
          detection_fps?: number
          detection_enabled?: boolean
        }
      >
    }

    const cameras = Object.entries(body.cameras ?? {}).map(
      ([camera, stats]): CameraHealth => ({
        camera,
        cameraFps: stats.camera_fps ?? 0,
        detectionFps: stats.detection_fps ?? 0,
        // Absent means an older NVR that does not report it; assume on, so a
        // dead camera is still reported rather than silently excused.
        detectionEnabled: stats.detection_enabled !== false,
      }),
    )

    return { state: 'ok', cameras }
  } catch (error) {
    return { state: 'unknown', reason: String(error) }
  }
}
