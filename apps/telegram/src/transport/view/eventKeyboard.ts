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

/** What the user sees while a clip is on its way. */
export const STAGE_LABELS = {
  requested: '⏳ Запрошено…',
  fetching: '⏳ Скачивается с камеры…',
  staged: '⏳ Конвертируется…',
} as const

export type ClipStage = keyof typeof STAGE_LABELS

/** Disabled-looking keyboard shown while the clip is being prepared. */
export const videoProcessingKeyboard = (
  stage: ClipStage = 'requested',
): InlineKeyboard =>
  new InlineKeyboard().text(STAGE_LABELS[stage], `${CLIP_PREFIX}${CLIP_WAIT}`)

/** Offers another go after a clip failed or took too long. */
export const videoRetryKeyboard = (eventId: string): InlineKeyboard =>
  new InlineKeyboard().text('🎬 Видео — повторить', `${CLIP_PREFIX}${eventId}`)
