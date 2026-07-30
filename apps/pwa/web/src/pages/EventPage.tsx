import { useEffect, useState } from 'react'
import { ArrowLeft, Camera, Clock, Gauge, ImageOff, Tag } from 'lucide-react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '@/lib/api'
import { navigate } from '@/lib/router'
import { clockTime } from '@/lib/time'
import type { FeedEntry } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; notFound: boolean }
  | { status: 'ready'; entry: FeedEntry }

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Camera
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export function EventPage({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    api
      .event(id)
      .then((entry) => active && setState({ status: 'ready', entry }))
      .catch((error) => {
        if (!active) return
        setState({
          status: 'error',
          notFound: error instanceof ApiError && error.status === 404,
        })
      })
    return () => {
      active = false
    }
  }, [id])

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
        <ArrowLeft className="size-4" />
        К ленте
      </Button>

      {state.status === 'loading' && (
        <div className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {state.status === 'error' && (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center">
            {state.notFound
              ? 'Событие не найдено или устарело.'
              : 'Не удалось загрузить событие.'}
          </CardContent>
        </Card>
      )}

      {state.status === 'ready' && <EventDetail entry={state.entry} />}
    </div>
  )
}

function EventDetail({ entry }: { entry: FeedEntry }) {
  const { event, snapshotUrl, clipUrl } = entry
  const duration = event.endTime ? event.endTime - event.startTime : null

  return (
    <>
      <Card className="overflow-hidden p-0">
        <AspectRatio ratio={16 / 9} className="bg-muted">
          {clipUrl ? (
            <video src={clipUrl} controls playsInline className="size-full object-contain" />
          ) : snapshotUrl ? (
            <Dialog>
              <DialogTrigger asChild>
                <button type="button" className="size-full">
                  <img
                    src={snapshotUrl}
                    alt={event.label ?? 'событие'}
                    className="size-full cursor-zoom-in object-cover"
                  />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl bg-transparent p-0">
                <DialogTitle className="sr-only">Кадр события</DialogTitle>
                <img src={snapshotUrl} alt={event.label ?? 'событие'} className="w-full rounded-xl" />
              </DialogContent>
            </Dialog>
          ) : (
            <div className="text-muted-foreground flex size-full items-center justify-center">
              <ImageOff className="size-10" />
            </div>
          )}
        </AspectRatio>
      </Card>

      <Card>
        <CardContent>
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-xl font-semibold capitalize">
              {event.label ?? 'объект'}
            </h1>
            <Badge variant={event.score >= 0.8 ? 'success' : 'secondary'}>
              {Math.round(event.score * 100)}%
            </Badge>
          </div>
          <Separator className="my-2" />
          <MetaRow icon={Camera} label="Камера" value={event.camera} />
          <MetaRow icon={Tag} label="Тип" value={event.type} />
          <MetaRow icon={Clock} label="Начало" value={clockTime(event.startTime)} />
          {event.endTime && (
            <MetaRow icon={Clock} label="Конец" value={clockTime(event.endTime)} />
          )}
          {duration !== null && (
            <MetaRow
              icon={Gauge}
              label="Длительность"
              value={`${Math.max(1, Math.round(duration))} c`}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}
