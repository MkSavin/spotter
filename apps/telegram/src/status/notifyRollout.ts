import type { Api, RawApi } from 'grammy'
import type { Stenograph } from 'stenograph'
import type { TelegramDatabase } from '../db/client'
import { tgBindingsRepo } from '../db/repository'
import type { RolloutChange } from './RolloutWatcher'

const line = (change: RolloutChange): string =>
  `<code>${change.service}</code> ${change.from} → <b>${change.to}</b>`

export const renderRollout = (changes: RolloutChange[]): string => {
  const byNode = new Map<string, RolloutChange[]>()
  for (const change of changes)
    byNode.set(change.node, [...(byNode.get(change.node) ?? []), change])

  const blocks = [...byNode.entries()].map(
    ([node, list]) => `<b>${node}</b>\n${list.map(line).join('\n')}`,
  )

  return `🚀 <b>Выкачено обновление</b>\n\n${blocks.join('\n\n')}`
}

/** Tells admins a rollout landed. Silent: not worth waking anyone for. */
export const notifyRollout = async (
  api: Api<RawApi>,
  db: TelegramDatabase,
  logger: Stenograph,
  changes: RolloutChange[],
): Promise<void> => {
  // Chats, not users: the same admin in two chats gets one message per chat.
  const chats = [
    ...new Set(
      tgBindingsRepo
        .list(db)
        .filter((binding) => binding.role === 'ADMIN')
        .map((binding) => binding.tgChatId),
    ),
  ]

  if (!chats.length) {
    logger.debug('Rollout notice skipped: no admin chats')
    return
  }

  const text = renderRollout(changes)

  const results = await Promise.allSettled(
    chats.map((chatId) =>
      api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_notification: true,
      }),
    ),
  )

  // One blocked chat must not hide the rest.
  const failed = results.filter((result) => result.status === 'rejected')
  for (const result of failed) logger.warn(`Rollout notice: ${result.reason}`)

  logger.info(
    `Rollout notice sent to ${chats.length - failed.length}/${chats.length} chats`,
  )
}
