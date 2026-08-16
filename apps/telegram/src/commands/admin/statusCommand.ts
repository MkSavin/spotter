import Bun from 'bun'
import type { BotContext } from '../../context'
import type { ServiceStatus } from '../../status/HeartbeatRegistry'
import { SpotterCommand } from '../framework/SpotterCommand'

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400)
  if (days > 0) return `${days}д`
  const hours = Math.floor(seconds / 3600)
  if (hours > 0) return `${hours}ч`
  return `${Math.max(1, Math.floor(seconds / 60))}м`
}

const staleFor = (at: number): string =>
  formatUptime(Math.round((Date.now() - at) / 1000))

/** Detail keys are plain identifiers; these are their display labels. */
const DETAIL_LABELS: Record<string, string> = {
  acceleration: 'ускорение',
}

const renderService = (service: ServiceStatus): string => {
  const mark = service.online ? '✅' : '⚠️'
  const state = service.online
    ? `в работе ${formatUptime(service.uptime)}`
    : `молчит ${staleFor(service.at)}`
  const extras = Object.entries(service.details ?? {})
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key} ${value}`)
    .join(', ')

  return `${mark} <code>${service.service}</code> <b>${service.version}</b> — ${state}${
    extras ? `\n    <i>${extras}</i>` : ''
  }`
}

class StatusCommand extends SpotterCommand {
  readonly name = 'status'
  readonly description = 'Состояние и версии сервисов'
  readonly access = 'ADMIN' as const

  async handle(context: BotContext): Promise<void> {
    const services = context.heartbeats.all()

    if (services.length === 0) {
      await context.replyWithHTML(
        `🧩 <b>Состояние развёртывания</b>

Сервисы ещё не отчитались. Отчёты приходят раз в 30 секунд — если пусто дольше
минуты, проверь связь между узлами.

Платформа: <code>Bun ${Bun.version_with_sha}</code>`,
      )
      return
    }

    const byNode = new Map<string, ServiceStatus[]>()
    for (const service of services) {
      byNode.set(service.node, [...(byNode.get(service.node) ?? []), service])
    }

    const blocks = [...byNode.entries()].map(
      ([node, list]) => `<b>${node}</b>\n${list.map(renderService).join('\n')}`,
    )

    const offline = services.filter((service) => !service.online).length

    await context.replyWithHTML(
      `🧩 <b>Состояние развёртывания</b>

${blocks.join('\n\n')}

${offline > 0 ? `⚠️ Не отвечают: ${offline}\n\n` : ''}Платформа: <code>Bun ${Bun.version_with_sha}</code>`,
    )
  }
}

export const statusCommand = new StatusCommand()
