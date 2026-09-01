import type { SpotterEvent } from '@spotter/transport'

/** What the domain will push to recipients. */
export type DeliveryPolicy = 'all' | 'alerts'

/**
 * Whether an event is worth waking someone for.
 *
 * `alerts` leans on the NVR's own verdict rather than a score threshold here:
 * Frigate already applies the zones, object filters and required-zone rules the
 * owner configured, and says whether the result is an `alert` or a mere
 * `detection`. Re-deriving that from `score` would both duplicate the setting
 * and ignore the zones it depends on.
 *
 * An event with no severity is always delivered: an NVR that does not classify
 * must not be silently muted, and neither must one whose review has not landed
 * yet.
 */
export const shouldDeliver = (
  event: Pick<SpotterEvent, 'severity'>,
  policy: DeliveryPolicy,
): boolean => policy === 'all' || event.severity !== 'detection'
