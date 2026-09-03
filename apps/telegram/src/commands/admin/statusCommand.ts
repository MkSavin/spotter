import { isSourceSilent, type ServiceStatus } from '@spotter/transport'
import Bun from 'bun'
import type { BotContext } from '../../context'
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

/** Strips the shared prefix: `spotter.media.staged.clip` → `media.staged.clip`. */
const shortStream = (stream: string): string => stream.replace(/^spotter\./, '')

/**
 * Backlog, shown only when there is one. A queue at zero is the normal state
 * and printing it on every service would bury the line that matters.
 */
const renderQueues = (service: ServiceStatus): string => {
  const queues = service.queues ?? []
  if (queues.length === 0) return ''

  const lines = queues.map((queue) => {
    const parts = [`${queue.lag} ждут`]
    if (queue.pending > 0) {
      const age = queue.oldestPendingMs
        ? ` (старейшей ${formatUptime(Math.round(queue.oldestPendingMs / 1000))})`
        : ''

      parts.push(`${queue.pending} в работе${age}`)
    }
    return `    📥 <code>${shortStream(queue.stream)}</code>: ${parts.join(', ')}`
  })

  return `\n${lines.join('\n')}`
}

/**
 * How long the NVR behind this adapter has been quiet.
 *
 * Shown for every adapter, not only the alarming ones: "last event 5 minutes
 * ago" is the line that says ingestion is alive, and its absence is what made
 * a day-long outage invisible.
 */
const renderSource = (service: ServiceStatus): string => {
  const activity = service.source
  if (!activity) return ''

  const faults: string[] = []
  if (activity.deadCameras?.length)
    faults.push(`нет видео: ${activity.deadCameras.join(', ')}`)
  if (activity.stalledCameras?.length)
    faults.push(`нет детекции: ${activity.stalledCameras.join(', ')}`)
  const cameraLine = faults.length ? `\n    🔴 ${faults.join('; ')}` : ''

  if (!activity.lastEventAt) {
    const waiting = formatUptime(activity.since)
    const mark = isSourceSilent(activity) ? '🔴' : '⏳'
    return `\n    ${mark} <code>${activity.source}</code>: событий не было (${waiting} с запуска)${cameraLine}`
  }

  const ago = formatUptime(
    Math.round((Date.now() - activity.lastEventAt) / 1000),
  )
  const mark = isSourceSilent(activity) ? '🔴' : '🎥'
  return `\n    ${mark} <code>${activity.source}</code>: последнее событие ${ago} назад, всего ${activity.eventCount}${cameraLine}`
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
  }${renderSource(service)}${renderQueues(service)}`
}

class StatusCommand extends SpotterCommand {
  readonly name = 'status'
  readonly description = 'Состояние и версии сервисов'
  readonly access = 'ADMIN' as const

  async handle(context: BotContext): Promise<void> {
    const services = context.heartbeats.all()

    if (services.length === 0) {
      await context.replyWithHTML(
        `🧩 <b>Состояние инфраструктуры</b>

Сервисы ещё не отчитались. Отчёты приходят раз в 30 секунд — если пусто дольше минуты, проверь связь между узлами.

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

    // Leads the message: an admin opening /status must not have to read past
    // healthy services to find the source that stopped.
    const broken = services.flatMap(
      (service) => service.source?.deadCameras ?? [],
    )

    const silent = services.filter(
      (service) => service.source && isSourceSilent(service.source),
    )
    const alarm =
      silent.length > 0
        ? `🔴 <b>Нет событий от NVR:</b> ${silent
            .map((service) => `<code>${service.source?.source}</code>`)
            .join(', ')} — проверь публикацию событий в MQTT\n\n`
        : ''

    const cameraAlarm =
      broken.length > 0
        ? `🔴 <b>NVR не получает видео:</b> ${broken
            .map((camera: string) => `<code>${camera}</code>`)
            .join(', ')} — событий по ним не будет\n\n`
        : ''

    await context.replyWithHTML(
      `🧩 <b>Состояние инфраструктуры</b>

${cameraAlarm}${alarm}${blocks.join('\n\n')}

${offline > 0 ? `⚠️ Не отвечают: ${offline}\n\n` : ''}Платформа: <code>Bun ${Bun.version_with_sha}</code>`,
    )
  }
}

export const statusCommand = new StatusCommand()
