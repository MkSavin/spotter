import { useEffect } from 'react'
import { Header } from '@/components/Header'
import type { Status } from '@/components/StatusDot'
import { Toaster } from '@/components/ui/sonner'
import { PushProvider, usePush } from '@/hooks/pushContext'
import { navigate, usePathname } from '@/lib/router'
import { EventPage } from '@/pages/EventPage'
import { FeedPage } from '@/pages/FeedPage'
import { SetupPage } from '@/pages/SetupPage'

const toStatus = (push: ReturnType<typeof usePush>): Status => {
  if (push.permission === 'denied') return 'blocked'
  if (push.subscribed && push.permission === 'granted') return 'active'
  return 'inactive'
}

function Routes({ status }: { status: Status }) {
  const pathname = usePathname()

  const eventMatch = pathname.match(/^\/event\/(.+)$/)
  if (eventMatch) return <EventPage id={decodeURIComponent(eventMatch[1])} />
  if (pathname === '/setup') return <SetupPage />
  return <FeedPage status={status} />
}

function Shell() {
  const push = usePush()
  const status = toStatus(push)

  // Follow deep-link navigation requested by the service worker on click.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'navigate' && event.data.url) {
        navigate(event.data.url)
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () =>
      navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  return (
    <div className="min-h-dvh">
      <Header status={status} />
      <main>
        <Routes status={status} />
      </main>
      <Toaster />
    </div>
  )
}

export function App() {
  return (
    <PushProvider>
      <Shell />
    </PushProvider>
  )
}
