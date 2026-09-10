import type { SpotterEvent } from '@spotter/transport'

/** What the domain will push to recipients. */
export type DeliveryPolicy = 'all' | 'alerts'

/**
 * `alerts` trusts the NVR's own verdict, which already applied the owner's
 * zones and filters. No severity means deliver: never mute what we cannot judge.
 */
export const shouldDeliver = (
  event: Pick<SpotterEvent, 'severity'>,
  policy: DeliveryPolicy | undefined,
): boolean => policy !== 'alerts' || event.severity !== 'detection'
