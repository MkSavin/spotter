import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../config'
import { deadCameras, readNvrHealth, stalledCameras } from './readNvrHealth'

/** How often to ask the NVR how its cameras are doing. */
export const HEALTH_POLL_MS = 60_000

export type CameraHealthWatch = {
  /** Latest reading, or undefined while the NVR has not answered yet. */
  current: () => { dead: string[]; stalled: string[] } | undefined
  /** Whether the NVR is rejecting our credentials. */
  unauthorized: () => boolean
  stop: () => void
}

/** Said once per transition, not once a minute: the fix is a human's to make. */
const UNAUTHORIZED_HELP =
  'NVR rejects our credentials — every media request will fail the same way. ' +
  "FRIGATE_AUTH_SECRET must equal the NVR's own JWT secret " +
  '(FRIGATE_JWT_SECRET, or config/.jwt_secret), and FRIGATE_AUTH_USER an existing user.'

/**
 * Polls the NVR's own camera counters in the background.
 *
 * On a timer rather than per heartbeat: the beat must stay cheap and must not
 * wait on the NVR, and camera health changes on the scale of minutes. State
 * transitions are logged, so a stream that drops at 02:00 leaves a line saying
 * so instead of only a gap where events used to be.
 */
export const watchCameraHealth = (
  config: CoreConfig,
  logger: Stenograph,
  intervalMs = HEALTH_POLL_MS,
): CameraHealthWatch => {
  let latest: { dead: string[]; stalled: string[] } | undefined
  let denied = false
  let reported = ''

  const poll = async (): Promise<void> => {
    const health = await readNvrHealth(config)

    if (health.state === 'unauthorized') {
      if (!denied) logger.error(`${health.status}: ${UNAUTHORIZED_HELP}`)
      denied = true
      return
    }

    if (denied) logger.info('NVR accepts our credentials again')
    denied = false

    if (health.state !== 'ok') {
      // Keep the last good reading: a failed probe is not evidence of health,
      // and dropping it would quietly clear a standing warning.
      logger.debug(`Could not read NVR stats: ${health.reason}`)
      return
    }

    const dead = deadCameras(health.cameras).map((camera) => camera.camera)
    const stalled = stalledCameras(health.cameras).map(
      (camera) => camera.camera,
    )
    latest = { dead, stalled }

    // Log the transition, not the state: at one poll a minute, repeating an
    // unchanged warning would bury everything else.
    const signature = `${dead.join(',')}|${stalled.join(',')}`
    if (signature === reported) return
    reported = signature

    if (dead.length > 0) {
      logger.error(
        `NVR reports no video from: ${dead.join(', ')} — no events can be produced for them`,
      )
    }
    if (stalled.length > 0) {
      logger.error(
        `NVR has video but no detection on: ${stalled.join(', ')} — no events will be produced`,
      )
    }
    if (dead.length === 0 && stalled.length === 0) {
      logger.info('NVR reports every enabled camera is detecting')
    }
  }

  void poll()
  const timer = setInterval(() => void poll(), intervalMs)
  timer.unref?.()

  return {
    current: () => latest,
    unauthorized: () => denied,
    stop: () => clearInterval(timer),
  }
}
