import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import type { Status } from '@/components/StatusDot'
import { Toaster } from '@/components/ui/sonner'
import { PushProvider, usePush } from '@/hooks/pushContext'
import { navigate, usePathname } from '@/lib/router'
import { isAuthorized } from '@/lib/session'
import { CamerasPage } from '@/pages/CamerasPage'
import { EventPage } from '@/pages/EventPage'
import { FeedPage } from '@/pages/FeedPage'
import { LoginPage } from '@/pages/LoginPage'
import { SetupPage } from '@/pages/SetupPage'
import { StatusPage } from '@/pages/StatusPage'

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
  if (pathname === '/cameras') return <CamerasPage />
  if (pathname === '/status') return <StatusPage />
  return <FeedPage status={status} />
}

function Shell() {
  const push = usePush()
  const status = toStatus(push)
  const [authorized, setAuthorized] = useState(isAuthorized)

  // A revoked or expired grant is cleared by the api client on the first 401;
  // this brings the gate back without a reload.
  useEffect(() => {
    const check = () => setAuthorized(isAuthorized())
    window.addEventListener('storage', check)
    const timer = setInterval(check, 5_000)
    return () => {
      window.removeEventListener('storage', check)
      clearInterval(timer)
    }
  }, [])

  const onAuthorized = useCallback(() => setAuthorized(true), [])

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

  if (!authorized) return <LoginPage onAuthorized={onAuthorized} />

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
