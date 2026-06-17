import type { SpotterEvent } from '@spotter/transport'
import { InlineKeyboard } from 'grammy'

/** callback_data prefix for the on-demand clip ("Видео") button. */
const CLIP_PREFIX = 'clip:'

/** Matches a clip callback; group 1 is the eventId (or the `wait` sentinel). */
export const clipCallbackPattern = /^clip:(.+)$/

/** Sentinel eventId used by the disabled "processing" button. */
export const CLIP_WAIT = 'wait'

/** Whether an event currently warrants offering the "Видео" button. */
export const shouldOfferClip = (event: SpotterEvent): boolean =>
  event.type === 'end' && event.hasClip

/** Inline keyboard with the active "Видео" button for an event message. */
export const videoButtonKeyboard = (eventId: string): InlineKeyboard =>
  new InlineKeyboard().text('🎬 Видео', `${CLIP_PREFIX}${eventId}`)

/** Disabled-looking keyboard shown right after the button is tapped. */
export const videoProcessingKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text(
    '⏳ Видео обрабатывается…',
    `${CLIP_PREFIX}${CLIP_WAIT}`,
  )
