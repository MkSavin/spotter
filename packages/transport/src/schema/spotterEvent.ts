import { z } from 'zod'

/**
 * How much attention an event deserves, as judged by the NVR rather than by a
 * score threshold here: it already knows the zones, object filters and times of
 * day the owner configured.
 *
 * `alert` — worth waking someone; `detection` — worth recording. Optional
 * because an NVR without the concept simply never sets it, and everything then
 * behaves as it did before.
 */
export const eventSeveritySchema = z.enum(['alert', 'detection'])
export type EventSeverity = z.infer<typeof eventSeveritySchema>

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
  source: z.string().min(1).optional(),
  severity: eventSeveritySchema.optional(),
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

/** Canonical stream names for the domain event ingress. */
export const eventStreams = {
  /** `spotter.event` — every adapter publishes SpotterEvents here. */
  event: 'spotter.event',
} as const

/**
 * Fallback `source` for events produced before adapters stamp it. Used by
 * consumers to route media/camera requests during the migration window.
 */
export const DEFAULT_SOURCE = 'frigate'

/** Resolve an event's routing source, applying the migration default. */
export const resolveSource = (event: Pick<SpotterEvent, 'source'>): string =>
  event.source ?? DEFAULT_SOURCE

/** Throws `ZodError` on invalid input. Use when producing the contract (sink). */
export const parseSpotterEvent = (value: unknown): SpotterEvent =>
  spotterEventSchema.parse(value)

/** Returns `null` on invalid input. Use when consuming from the wire (bot). */
export const safeParseSpotterEvent = (value: unknown): SpotterEvent | null => {
  const result = spotterEventSchema.safeParse(value)
  return result.success ? result.data : null
}
