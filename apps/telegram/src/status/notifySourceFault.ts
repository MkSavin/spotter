import type { Api, RawApi } from 'grammy'
import type { Stenograph } from 'stenograph'
import type { TelegramDatabase } from '../db/client'
import { tgBindingsRepo } from '../db/repository'
import type { SourceAlert } from './SourceWatcher'

const duration = (seconds: number): string => {
  if (seconds >= 86_400) return `${Math.floor(seconds / 86_400)} д`
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ч`
  return `${Math.max(1, Math.floor(seconds / 60))} мин`
}

export const renderSourceAlert = (alert: SourceAlert): string => {
  const where = `<code>${alert.source}</code> на <b>${alert.node}</b>`

  if (alert.recovered) {
    return `✅ <b>NVR снова на связи</b>\n\n${where} — молчал ${duration(alert.forSeconds)}.`
  }

  if (alert.fault === 'unreachable') {
    return `🚨 <b>NVR не выходит на связь</b>

${where} молчит ${duration(alert.forSeconds)} — не приходит вообще ничего, даже служебных сообщений.

<b>События не доходят. За участком никто не следит.</b>

Обычно это сеть между NVR и брокером или выключенный MQTT в самом NVR.`
  }

  return `⚠️ <b>От NVR давно нет событий</b>

${where} — тишина уже ${duration(alert.forSeconds)}.

Связь есть, но событий нет. Возможно, всё спокойно, а возможно, камеры не отдают видео — проверь <code>/status</code>.`
}

/**
 * Tells admins their NVR went quiet.
 *
 * With sound, unlike a rollout notice: this is the message whose absence cost
 * two days of unnoticed silence, and a muted notification would put us back
 * exactly where we started.
 */
export const notifySourceFault = async (
  api: Api<RawApi>,
  db: TelegramDatabase,
  logger: Stenograph,
  alert: SourceAlert,
): Promise<void> => {
  const chats = [
    ...new Set(
      tgBindingsRepo
        .list(db)
        .filter((binding) => binding.role === 'ADMIN')
        .map((binding) => binding.tgChatId),
    ),
  ]

  if (!chats.length) {
    logger.warn(`No admin chat to tell that ${alert.source} is ${alert.fault}`)
    return
  }

  const text = renderSourceAlert(alert)

  const results = await Promise.allSettled(
    chats.map((chatId) =>
      api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        // Recovery can arrive quietly; the outage itself cannot.
        disable_notification: alert.recovered === true,
      }),
    ),
  )

  const failed = results.filter((result) => result.status === 'rejected').length
  if (failed > 0) logger.warn(`Source alert undelivered to ${failed} chat(s)`)
}
