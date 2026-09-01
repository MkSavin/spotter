import { Clapperboard, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { hasRole } from '@/lib/session'
import { formatSpan, fromLocalInput, quickSpans, type Span } from '@/lib/spans'
import type { CameraEntry, Timelapse, TimelapseSpeed } from '@/lib/types'

const REASONS: Record<string, string> = {
  empty: 'за этот период нет записей',
  rejected: 'NVR не смог собрать экспорт',
  timeout: 'экспорт не завершился вовремя',
}

/** Two speeds because the NVR API takes exactly two; the multiplier of the
 *  fast one is set in the NVR's own config, so the label does not promise it. */
const SPEEDS: Array<{ code: TimelapseSpeed; label: string }> = [
  { code: 'timelapse', label: '⏩ Ускоренно' },
  { code: 'realtime', label: '▶️ Реальное время' },
]

function StartForm({
  cameras,
  onStarted,
}: {
  cameras: CameraEntry[]
  onStarted: () => void
}) {
  const presets = quickSpans()
  const [camera, setCamera] = useState(cameras[0]?.code ?? '')
  const [speed, setSpeed] = useState<TimelapseSpeed>('timelapse')
  const [preset, setPreset] = useState(presets[0].key)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [busy, setBusy] = useState(false)

  const custom = preset === 'custom'

  const resolveSpan = (): Span | null => {
    if (!custom) {
      return presets.find((entry) => entry.key === preset)?.span ?? null
    }

    const start = fromLocalInput(customFrom)
    const end = fromLocalInput(customTo)
    if (start === null || end === null || end <= start) return null
    return { start, end }
  }

  const submit = async () => {
    const span = resolveSpan()

    if (!span) {
      toast.error('Укажите период: конец должен быть позже начала')
      return
    }
    if (!camera) return

    setBusy(true)
    try {
      await api.startTimelapse({ camera, ...span, speed })
      toast.success('Таймлапс поставлен в очередь', {
        description: 'Сборка занимает несколько минут',
      })
      onStarted()
    } catch {
      toast.error('Не удалось запустить таймлапс')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Собрать таймлапс</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Камера</p>
          <div className="flex flex-wrap gap-2">
            {cameras.map((entry) => (
              <Button
                key={entry.code}
                size="sm"
                variant={camera === entry.code ? 'default' : 'outline'}
                onClick={() => setCamera(entry.code)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Период</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((entry) => (
              <Button
                key={entry.key}
                size="sm"
                variant={preset === entry.key ? 'default' : 'outline'}
                onClick={() => setPreset(entry.key)}
              >
                {entry.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={custom ? 'default' : 'outline'}
              onClick={() => setPreset('custom')}
            >
              Свой
            </Button>
          </div>

          {custom && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Input
                type="datetime-local"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
              <Input
                type="datetime-local"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Скорость</p>
          <div className="flex flex-wrap gap-2">
            {SPEEDS.map((entry) => (
              <Button
                key={entry.code}
                size="sm"
                variant={speed === entry.code ? 'default' : 'outline'}
                onClick={() => setSpeed(entry.code)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>

        <Button className="w-full" disabled={busy || !camera} onClick={submit}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          Собрать
        </Button>
      </CardContent>
    </Card>
  )
}

function TimelapseCard({ entry }: { entry: Timelapse }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-medium">{entry.camera}</p>
          <Badge
            variant={
              entry.state === 'ready'
                ? 'success'
                : entry.state === 'failed'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {entry.state === 'ready'
              ? 'готов'
              : entry.state === 'failed'
                ? 'ошибка'
                : 'собирается'}
          </Badge>
        </div>

        <p className="text-muted-foreground text-xs">
          {formatSpan({ start: entry.start, end: entry.end })}
          {entry.speed === 'timelapse' ? ' · ускоренно' : ' · реальное время'}
        </p>

        {entry.state === 'failed' && (
          <p className="text-destructive text-xs">
            {REASONS[entry.reason ?? ''] ?? entry.reason}
          </p>
        )}

        {entry.videoUrl && (
          // biome-ignore lint/a11y/useMediaCaption: a timelapse has no audio
          <video
            src={entry.videoUrl}
            controls
            playsInline
            className="w-full rounded-lg"
          />
        )}
      </CardContent>
    </Card>
  )
}

export function TimelapsePage() {
  const [cameras, setCameras] = useState<CameraEntry[]>([])
  const [items, setItems] = useState<Timelapse[] | null>(null)
  const mayStart = hasRole('USER')

  const load = useCallback(() => {
    api
      .timelapses()
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  useEffect(() => {
    api.cameras().then(setCameras).catch(() => undefined)
    load()
  }, [load])

  // An export finishes minutes later with no push of its own; poll while any
  // are still running so the card turns into a video on its own.
  useEffect(() => {
    if (!items?.some((entry) => entry.state === 'running')) return

    const timer = setInterval(load, 10_000)
    return () => clearInterval(timer)
  }, [items, load])

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Clapperboard className="size-5" />
        Таймлапсы
      </h1>

      {mayStart && cameras.length > 0 && (
        <StartForm cameras={cameras} onStarted={load} />
      )}

      {items === null && <Skeleton className="h-24 w-full rounded-xl" />}

      {items?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Пока ничего не собрано.
        </p>
      )}

      <div className="space-y-3">
        {items?.map((entry) => (
          <TimelapseCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}
