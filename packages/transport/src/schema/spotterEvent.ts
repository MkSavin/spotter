import { z } from 'zod'

/**
 * Canonical cross-service event contract.
 *
 * Every NVR adapter (sink) must emit objects conforming to this schema onto the
 * `spotter.event` stream; all downstream consumers (bot) depend only on this
 * shape. This schema — not any single producer — is the contract, so a custom
 * sink in any language just has to publish a valid `SpotterEvent`.
 */
export const spotterEventSchema = z.object({
  id: z.string().min(1),
  camera: z.string().min(1),
  label: z.string().nullable(),
  startTime: z.number(),
  endTime: z.number().nullable(),
  score: z.number(),
  stationary: z.boolean(),
  hasClip: z.boolean(),
  hasSnapshot: z.boolean(),
  type: z.string().min(1),
})

export type SpotterEvent = z.infer<typeof spotterEventSchema>

/** Throws `ZodError` on invalid input. Use when producing the contract (sink). */
export const parseSpotterEvent = (value: unknown): SpotterEvent =>
  spotterEventSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire (bot). */
export const safeParseSpotterEvent = (value: unknown): SpotterEvent | null => {
  const result = spotterEventSchema.safeParse(value)
  return result.success ? result.data : null
}
