import type { Stenograph } from 'stenograph'

/** What the probe answers on a successful arm. */
export type ProbeArmed = {
  ok: boolean
  frames: number
}

/**
 * The probe answers with raw class ids that Frigate resolves through its own
 * labelmap, so this table must agree with it; an unknown label is refused.
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
