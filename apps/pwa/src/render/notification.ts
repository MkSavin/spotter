import { type SpotterEvent, renderEvent } from '@spotter/transport'
import type { CatalogCache } from '../catalog/CatalogCache'

export type NotificationPayload = {
  title: string
  body: string
  /** Deep-link path opened on click. */
  url: string
  /** Notification tag — a new push with the same tag replaces the old one. */
  tag: string
}

const resolveLabels = (
  event: SpotterEvent,
  catalog: CatalogCache,
  source: string,
) => ({
  camera: catalog.cameraLabel(source, event.camera, 'неизв. камера'),
  object: catalog.objectLabel(source, event.label ?? '', 'неизв. объект'),
})

/** Builds the push payload for a single event notification. */
export const renderEventNotification = (
  eventId: string,
  event: SpotterEvent,
  catalog: CatalogCache,
  source: string,
  timezone: string,
): NotificationPayload => {
  const labels = resolveLabels(event, catalog, source)
  const rendered = renderEvent(event, labels, timezone)
  return {
    title: `⚠ ${labels.camera}`,
    body: `${labels.object} · ${rendered.time}`,
    url: `/event/${eventId}`,
    tag: eventId,
  }
}

/** Builds the collapsed payload when several events fire within one window. */
export const renderBurstNotification = (
  camera: string,
  count: number,
): NotificationPayload => ({
  title: `⚠ ${camera}`,
  body: `${count} событий за последнюю минуту`,
  url: '/',
  tag: `burst:${camera}`,
})
