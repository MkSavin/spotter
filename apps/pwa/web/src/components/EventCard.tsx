import { Camera, ImageOff, Video } from 'lucide-react'
import { useState } from 'react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { mediaSrc } from '@/lib/api'
import { log } from '@/lib/log'
import { Link } from '@/lib/router'
import { relativeTime } from '@/lib/time'
import type { FeedEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

const scoreVariant = (score: number) =>
  score >= 0.8 ? 'success' : score >= 0.5 ? 'warning' : 'secondary'

/** One event in the feed: snapshot, object/camera, relative time, score/clip badges. */
export function EventCard({ entry, isNew }: { entry: FeedEntry; isNew?: boolean }) {
  const { event, snapshotUrl } = entry
  // A key can outlive its object; show the placeholder rather than a broken
  // image icon, and leave a line saying which event lost its snapshot.
  const [failed, setFailed] = useState(false)
  const src = failed ? undefined : mediaSrc(snapshotUrl)

  return (
    <Link href={`/event/${entry.eventId}`} className="block">
      <Card
        className={cn(
          'gap-0 overflow-hidden p-0 transition-colors hover:border-primary/40',
          isNew && 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2',
        )}
      >
        <AspectRatio ratio={16 / 9} className="bg-muted">
          {src ? (
            <img
              src={src}
              alt={event.label ?? 'событие'}
              loading="lazy"
              className="size-full object-cover"
              onError={() => {
                log.warn('Snapshot failed to load', { eventId: entry.eventId })
                setFailed(true)
              }}
            />
          ) : (
            <div className="text-muted-foreground flex size-full items-center justify-center">
              <ImageOff className="size-8" />
            </div>
          )}
        </AspectRatio>

        <div className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="truncate font-medium capitalize">
              {event.label ?? 'объект'}
            </p>
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              <Camera className="size-3.5 shrink-0" />
              <span className="truncate">{event.camera}</span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <time className="text-muted-foreground text-xs whitespace-nowrap">
              {relativeTime(event.startTime)}
            </time>
            <div className="flex items-center gap-1">
              {event.hasClip && (
                <Badge variant="secondary" className="gap-1">
                  <Video className="size-3" />
                </Badge>
              )}
              <Badge variant={scoreVariant(event.score)}>
                {Math.round(event.score * 100)}%
              </Badge>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
