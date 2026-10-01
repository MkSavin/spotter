import type { Bot } from 'grammy'
import type { ClipStatus } from '../clip/ClipTracker'
import type { BotApi, BotContext } from '../context'
import { eventMessagesRepo } from '../db/repository'
import {
  CLIP_WAIT,
  clipCallbackPattern,
  stageLabel,
  videoProcessingKeyboard,
} from '../transport/view/eventKeyboard'

/** Server error codes, in words the user can act on. */
const CLIP_ERRORS: Record<string, string> = {
  'not-found': 'Событие не найдено',
  'no-clip': 'У события нет видео',
}

const minutes = (ms: number): string =>
  `${Math.max(1, Math.ceil(ms / 60_000))} мин`

const describeWait = (status: ClipStatus, now: number): string =>
  `${stageLabel(status.stage, status.percent)} Перезапуск станет доступен через ${minutes(status.deadline - now)}.`

/** The processing button carries no event id; the message it sits on does. */
const eventOfMessage = (context: BotContext): string | undefined => {
  const message = context.callbackQuery?.message
  if (!message) return undefined
  return eventMessagesRepo.findEventId(
    context.db,
    String(message.chat.id),
    message.message_id,
  )
}

const requestClip = async (
  context: BotContext,
  eventId: string,
): Promise<void> => {
  await context.answerCallbackQuery({ text: 'Запрашиваю видео…' })

  try {
    // Swap to the disabled state immediately to prevent duplicate requests.
    await context.editMessageReplyMarkup({
      reply_markup: videoProcessingKeyboard('requested'),
    })
  } catch (error) {
    context.logger.debug('Failed to set processing keyboard', error)
  }

  const logger = context.logger.sub('clip')

  // Before the RPC: stages may arrive while it is still in flight.
  context.clips.begin(eventId)

  try {
    const reply = await context.commandBus.send(
      'event.clip',
      { eventId },
      context.session.user.recipientUuid,
    )
    // Logging alone left the user staring at "processing" forever.
    if (!reply.ok) {
      logger.warn(`event.clip rejected for ${eventId}: ${reply.error}`)
      context.clips.fail(
        eventId,
        CLIP_ERRORS[reply.error ?? ''] ?? 'Запрос отклонён',
      )
    }
  } catch (error) {
    logger.error('event.clip command failed', error)
    context.clips.fail(eventId, 'Сервис не ответил')
  }
}

/**
 * Requests an on-demand transcode; the video returns through the normal media
 * path. Any member of an authorized chat may tap it.
 *
 * A tap on the processing button re-checks the wait: while it lives the user
 * is told where the clip is, and once nothing awaits it — timed out, or lost
 * with a failed repaint or a restart — the tap starts it again, so the button
 * can never be stuck for good.
 */
export const registerClipCallback = (bot: Bot<BotContext, BotApi>): void => {
  bot.callbackQuery(clipCallbackPattern, async (context) => {
    const target = context.match?.[1]
    if (!target) return

    if (target !== CLIP_WAIT) {
      await requestClip(context, target)
      return
    }

    const eventId = eventOfMessage(context)
    if (!eventId) {
      await context.answerCallbackQuery({ text: 'Событие не найдено' })
      return
    }

    const now = Date.now()
    const status = context.clips.status(eventId)

    if (status && now < status.deadline) {
      await context.answerCallbackQuery({ text: describeWait(status, now) })
      try {
        // The label may be stale if a repaint was lost; show where it is now.
        await context.editMessageReplyMarkup({
          reply_markup: videoProcessingKeyboard(status.stage, status.percent),
        })
      } catch (error) {
        context.logger.debug('Clip button already current', error)
      }
      return
    }

    context.logger.info(`Restarting a stalled clip wait for ${eventId}`)
    await requestClip(context, eventId)
  })
}
