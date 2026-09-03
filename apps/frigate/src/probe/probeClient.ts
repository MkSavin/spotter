import type { Stenograph } from 'stenograph'

/** What the probe answers on a successful arm. */
export type ProbeArmed = {
  ok: boolean
  frames: number
}

/**
 * Label to class id, matching the `labelmap` the rig's Frigate is configured
 * with.
 *
 * The probe has no model and no label map — it answers with raw class ids, and
 * Frigate resolves them through its own. So this table has to agree with the
 * NVR's config, and an unknown label is refused rather than quietly detected
 * as something else.
 */
export const PROBE_LABELS: Record<string, number> = {
  person: 0,
  car: 1,
}

export const probeClassId = (label: string): number | null =>
  PROBE_LABELS[label] ?? null

/**
 * Asks `spotter-probe` to report a detection for the next N frames.
 *
 * This does not create an event — it makes the NVR see one. Everything after
 * that is Frigate's own work: tracking, recording, severity and the publish.
 */
export const armProbe = async (
  endpoint: string,
  request: { label: string; frames: number; score: number },
  logger: Stenograph,
): Promise<ProbeArmed | null> => {
  const classId = probeClassId(request.label)

  if (classId === null) {
    const known = Object.keys(PROBE_LABELS).join(', ')
    logger.warn(`Probe cannot stage "${request.label}"; it knows: ${known}`)
    return null
  }

  const url = `${endpoint.replace(/\/$/, '')}/detect`

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        score: request.score,
        frames: request.frames,
      }),
    })

    if (!response.ok) {
      logger.warn(`Probe ${url} returned ${response.status}`)
      return null
    }

    return (await response.json()) as ProbeArmed
  } catch (error) {
    logger.warn(`Could not reach the probe at ${url}:`, error)
    return null
  }
}
