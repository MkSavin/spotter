import {
  type SpotterEvent,
  eventCode,
  renderEventTime,
  renderEventTiming,
} from '@spotter/transport'
import type { CoreContext } from '../../context'

export type RenderedEmail = {
  subject: string
  text: string
  html: string
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * Renders an event into a self-contained email: the subject stands alone in the
 * inbox list (marker · object · camera · time), the body repeats it as
 * plain-text and HTML, optionally embeds the snapshot (presigned URL) and a
 * deep link back into the web frontend. HTML + text so no client mangles it.
 */
export const renderEmail = (
  event: SpotterEvent,
  context: CoreContext,
  media?: { snapshotUrl?: string; eventUrl?: string },
): RenderedEmail => {
  const { config, catalog } = context
  const source = event.source ?? config.source

  const label = catalog.objectLabel(source, event.label ?? '', 'неизв. объект')
  const camera = catalog.cameraLabel(source, event.camera, 'неизв. камера')
  const code = eventCode(event.id)
  const time = renderEventTime(event, config.timezone)
  const timing = renderEventTiming(event, config.timezone)

  const subject = `SPOTTER ⚠ ${camera} · ${label} · ${time}`

  const textLines = [
    `Spotter — событие ${code}`,
    `${label} · ${camera}`,
    `📅 ${timing}`,
  ]
  if (media?.snapshotUrl) textLines.push(`Кадр: ${media.snapshotUrl}`)
  if (media?.eventUrl) textLines.push(`Открыть: ${media.eventUrl}`)
  const text = textLines.join('\n')

  const snapshotBlock = media?.snapshotUrl
    ? `<p><img src="${escapeHtml(media.snapshotUrl)}" alt="Кадр события" style="max-width:100%;border-radius:8px" /></p>`
    : ''
  const linkBlock = media?.eventUrl
    ? `<p><a href="${escapeHtml(media.eventUrl)}">Открыть событие</a></p>`
    : ''

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.4">
  <p><strong>Spotter — событие</strong> <code>${escapeHtml(code)}</code></p>
  <p><strong>${escapeHtml(label)}</strong> · <strong>${escapeHtml(camera)}</strong></p>
  <p>📅 ${escapeHtml(timing)}</p>
  ${snapshotBlock}
  ${linkBlock}
</div>`

  return { subject, text, html }
}
