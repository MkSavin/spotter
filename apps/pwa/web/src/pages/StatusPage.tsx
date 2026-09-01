import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { ServiceStatus } from '@/lib/types'

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400)
  if (days > 0) return `${days}д`
  const hours = Math.floor(seconds / 3600)
  if (hours > 0) return `${hours}ч`
  return `${Math.floor(seconds / 60)}м`
}

/** Liveness and versions per node, mirroring the bot's `/status`. */
export function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null)

  useEffect(() => {
    let active = true

    const load = () =>
      api
        .status()
        .then((list) => active && setServices(list))
        .catch(() => active && setServices([]))

    load()
    // Heartbeats land every 30s; refreshing keeps a stale service from looking
    // alive while the screen is open.
    const timer = setInterval(load, 30_000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const byNode = new Map<string, ServiceStatus[]>()
  for (const service of services ?? []) {
    const list = byNode.get(service.node) ?? []
    list.push(service)
    byNode.set(service.node, list)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <h1 className="text-lg font-semibold">Состояние</h1>

      {services === null && <Skeleton className="h-32 w-full rounded-xl" />}

      {services?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Сервисы ещё не прислали heartbeat.
        </p>
      )}

      {[...byNode.entries()].map(([node, list]) => (
        <div key={node} className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase">{node}</p>

          <Card>
            <CardContent className="divide-border divide-y p-0">
              {list.map((service) => (
                <div
                  key={`${service.node}/${service.service}`}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{service.service}</p>
                    <p className="text-muted-foreground text-xs">
                      v{service.version} · {formatUptime(service.uptime)}
                    </p>
                  </div>

                  <Badge variant={service.online ? 'success' : 'secondary'}>
                    {service.online ? 'онлайн' : 'нет связи'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
