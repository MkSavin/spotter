import { Camera, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { hasRole } from '@/lib/session'
import type { CameraEntry } from '@/lib/types'

/**
 * The NVR's cameras, each with a snapshot button.
 *
 * The frame does not come back over HTTP: the request goes onto the media
 * pipeline and the resulting photo arrives as a push, the same way an event's
 * does. So the button confirms the request and says where to look for it.
 */
export function CamerasPage() {
  const [cameras, setCameras] = useState<CameraEntry[] | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const mayRequest = hasRole('USER')

  useEffect(() => {
    let active = true
    api
      .cameras()
      .then((list) => active && setCameras(list))
      .catch(() => active && setCameras([]))
    return () => {
      active = false
    }
  }, [])

  const snapshot = async (camera: CameraEntry) => {
    setPending(camera.code)
    try {
      await api.snapshot(camera.code)
      toast.success(`Снимок ${camera.label} запрошен`, {
        description: 'Придёт уведомлением, когда будет готов',
      })
    } catch {
      toast.error('Не удалось запросить снимок')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
      <h1 className="text-lg font-semibold">Камеры</h1>

      {cameras === null && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {cameras?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Список камер пока недоступен — NVR ещё не отдал каталог.
        </p>
      )}

      {cameras?.map((camera) => (
        <Card key={camera.code}>
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{camera.label}</p>
              <p className="text-muted-foreground truncate text-xs">
                {camera.code}
              </p>
            </div>

            {mayRequest && (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending !== null}
                onClick={() => snapshot(camera)}
              >
                {pending === camera.code ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                Снимок
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
