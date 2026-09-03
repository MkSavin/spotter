import type { ProbeRequest } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../../config'
import { armProbe } from '../../probe/probeClient'

export type ProbeOutcome =
  | { staged: true; camera: string; frames: number }
  | { staged: false; reason: string }

/**
 * Stages a detection on the NVR by arming the probe.
 *
 * Deliberately says nothing about events: the NVR decides whether what it now
 * "sees" amounts to one. That is the entire point — a staged detection tests
 * the NVR's judgement, a seeded event replaces it.
 */
export const probeAction = async (
  config: CoreConfig,
  request: ProbeRequest,
  logger: Stenograph,
): Promise<ProbeOutcome> => {
  if (!config.probeEndpoint) {
    return {
      staged: false,
      reason:
        'Probe is not configured — it replaces the detector, so it runs only behind its profile.',
    }
  }

  // The camera is the caller's to choose: it holds the catalog, and the probe
  // itself has no notion of cameras — it answers for whatever frame the NVR
  // happens to be analysing.
  const camera = request.camera ?? 'the configured camera'

  const armed = await armProbe(
    config.probeEndpoint,
    { label: request.label, frames: request.frames, score: request.score },
    logger,
  )

  if (!armed?.ok) {
    return { staged: false, reason: 'The probe did not accept the detection.' }
  }

  return { staged: true, camera, frames: armed.frames }
}
