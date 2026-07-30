import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function EventCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <AspectRatio ratio={16 / 9}>
        <Skeleton className="size-full rounded-none" />
      </AspectRatio>
      <div className="flex items-center justify-between p-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-5 w-10" />
      </div>
    </Card>
  )
}
