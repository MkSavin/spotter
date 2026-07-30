import { cn } from '@/lib/utils'

export type Status = 'active' | 'inactive' | 'blocked'

const STYLES: Record<Status, { color: string; label: string }> = {
  active: { color: 'bg-success', label: 'Уведомления включены' },
  inactive: { color: 'bg-warning', label: 'Уведомления не подключены' },
  blocked: { color: 'bg-destructive', label: 'Уведомления заблокированы' },
}

/** Small live dot conveying push status at a glance (green/amber/red). */
export function StatusDot({ status }: { status: Status }) {
  const { color, label } = STYLES[status]
  return (
    <span className="relative flex size-2.5" aria-label={label} role="status">
      {status === 'active' && (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-60',
            color,
          )}
        />
      )}
      <span className={cn('relative inline-flex size-2.5 rounded-full', color)} />
    </span>
  )
}
