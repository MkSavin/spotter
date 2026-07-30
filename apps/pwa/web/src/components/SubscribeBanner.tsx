import { BellOff, BellRing } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { navigate } from '@/lib/router'
import type { Status } from './StatusDot'

const CONTENT: Record<
  Exclude<Status, 'active'>,
  { title: string; description: string; cta: string }
> = {
  inactive: {
    title: 'Уведомления не подключены',
    description: 'Подключите пуш, чтобы события приходили на устройство.',
    cta: 'Включить',
  },
  blocked: {
    title: 'Уведомления заблокированы',
    description: 'Разрешите уведомления в настройках, чтобы получать события.',
    cta: 'Как включить',
  },
}

/** Non-intrusive nudge on the feed when push isn't active. Hidden when active. */
export function SubscribeBanner({ status }: { status: Status }) {
  if (status === 'active') return null
  const { title, description, cta } = CONTENT[status]
  const Icon = status === 'blocked' ? BellOff : BellRing

  return (
    <Alert variant={status === 'blocked' ? 'warning' : 'default'}>
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex-row items-center justify-between gap-3">
        <span>{description}</span>
        <Button size="sm" onClick={() => navigate('/setup')}>
          {cta}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
