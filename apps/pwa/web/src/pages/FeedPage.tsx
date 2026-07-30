import { AlertCircle, Inbox, RefreshCw } from 'lucide-react'
import { EventCard } from '@/components/EventCard'
import { EventCardSkeleton } from '@/components/EventCardSkeleton'
import { SubscribeBanner } from '@/components/SubscribeBanner'
import { Button } from '@/components/ui/button'
import type { Status } from '@/components/StatusDot'
import { useEvents } from '@/hooks/useEvents'
import { groupByDay } from '@/lib/group'

function EmptyState() {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 py-20 text-center">
      <Inbox className="size-10" />
      <div>
        <p className="text-foreground font-medium">Событий пока нет</p>
        <p className="text-sm">Уведомления с камер появятся здесь.</p>
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 py-20 text-center">
      <AlertCircle className="text-destructive size-10" />
      <p>Не удалось загрузить события.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-4" />
        Повторить
      </Button>
    </div>
  )
}

export function FeedPage({ status }: { status: Status }) {
  const { events, loading, error, reload } = useEvents()

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <SubscribeBanner status={status} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : events.length === 0 ? (
        <EmptyState />
      ) : (
        groupByDay(events).map((group) => (
          <section key={group.key} className="space-y-3">
            <h2 className="text-muted-foreground bg-background/80 sticky top-14 z-10 py-1 text-xs font-medium uppercase tracking-wide backdrop-blur">
              {group.heading}
            </h2>
            {group.entries.map((entry) => (
              <EventCard key={entry.eventId} entry={entry} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
