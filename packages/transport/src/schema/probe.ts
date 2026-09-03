import { z } from 'zod'

/**
 * Contract for asking an adapter to stage a detection on its NVR.
 *
 * A request to the adapter rather than a synthetic event on the bus, for the
 * same reason notification suspension is: only the adapter knows how its NVR
 * can be made to see something. For Frigate that means driving a stub detector
 * over ZMQ; the NVR then does its own tracking, recording and publishing.
 *
 * This is what makes the test honest. Seeding `spotter.event` directly proves
 * our idea of an event, never the NVR's — and the stretch between the two went
 * silent for two days in production without a single test noticing.
 */
export const probeRequestSchema = z.object({
  source: z.string().min(1),
  /** Camera code; the adapter picks its first camera when absent. */
  camera: z.string().min(1).optional(),
  /** Object label, e.g. `person`. */
  label: z.string().min(1).default('person'),
  /**
   * How many analysed frames the object stays visible.
   *
   * Frames, not seconds: the NVR asks its detector once per analysed frame, so
   * a frame count survives a camera running at a different rate. One frame is
   * discarded as noise, hence a default with room to spare.
   */
  frames: z.number().int().positive().default(30),
  /** Detection confidence to report, 0..1. */
  score: z.number().min(0).max(1).default(0.9),
  /** Who asked, so the adapter can report back. */
  chatId: z.number().optional(),
})

export type ProbeRequest = z.infer<typeof probeRequestSchema>

/** Stream carrying probe requests to the `<source>` adapter. */
export const probeStreams = {
  request: (source: string): string => `spotter.probe.request.${source}`,
} as const

/** Throws `ZodError` on invalid input. Use when producing. */
export const parseProbeRequest = (value: unknown): ProbeRequest =>
  probeRequestSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseProbeRequest = (value: unknown): ProbeRequest | null => {
  const result = probeRequestSchema.safeParse(value)
  return result.success ? result.data : null
}
