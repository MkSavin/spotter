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
  // Staged but no percent yet: depot has not picked the job up, so the honest
  // word is "queued" — ffmpeg reports a percent the moment it starts.
  staged: '⏳ В очереди…',
} as const

export type ClipStage = keyof typeof STAGE_LABELS

/** Percent turns the transcoding label into a progress one. */
const stageLabel = (stage: ClipStage, percent?: number): string =>
  stage === 'staged' && percent !== undefined
    ? `⏳ Конвертируется… ${percent}%`
    : STAGE_LABELS[stage]

/** Disabled-looking keyboard shown while the clip is being prepared. */
export const videoProcessingKeyboard = (
  stage: ClipStage = 'requested',
  percent?: number,
): InlineKeyboard =>
  new InlineKeyboard().text(
    stageLabel(stage, percent),
    `${CLIP_PREFIX}${CLIP_WAIT}`,
  )

/** Offers another go after a clip failed or took too long. */
export const videoRetryKeyboard = (eventId: string): InlineKeyboard =>
  new InlineKeyboard().text('🎬 Видео — повторить', `${CLIP_PREFIX}${eventId}`)
