import { z } from 'zod'

/**
 * Asks the adapter to make its NVR *see* something, rather than seeding an
 * event ourselves. See docs/foundings/silent-failures.md.
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

/**
 * What the adapter made of a probe request.
 *
 * A staged detection that quietly fails is the worst possible outcome for this
 * command: the caller waits for an event that is never coming, and reads the
 * silence as the very fault they were testing for. So the adapter always
 * answers, and a refusal carries the reason.
 */
export const probeResultSchema = z.object({
  source: z.string().min(1),
  staged: z.boolean(),
  /** Camera the detection was staged on; absent on a refusal. */
  camera: z.string().min(1).optional(),
  /** Frames it will run for; absent on a refusal. */
  frames: z.number().int().positive().optional(),
  /** Why it was refused, in a form worth showing a person. */
  reason: z.string().min(1).optional(),
  /** Echoed back so the bot can answer in the chat that asked. */
  chatId: z.number().optional(),
})

export type ProbeResult = z.infer<typeof probeResultSchema>

/** Streams carrying probe requests and their outcome. */
export const probeStreams = {
  request: (source: string): string => `spotter.probe.request.${source}`,
  /** Not per source: one consumer on the delivery side handles them all. */
  result: 'spotter.probe.result',
} as const

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseProbeResult = (value: unknown): ProbeResult | null => {
  const result = probeResultSchema.safeParse(value)
  return result.success ? result.data : null
}

/** Throws `ZodError` on invalid input. Use when producing. */
export const parseProbeRequest = (value: unknown): ProbeRequest =>
  probeRequestSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire. */
export const safeParseProbeRequest = (value: unknown): ProbeRequest | null => {
  const result = probeRequestSchema.safeParse(value)
  return result.success ? result.data : null
}
