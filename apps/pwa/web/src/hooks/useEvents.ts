import { api } from '@/lib/api'
import type { FeedEntry } from '@/lib/types'
import { useCallback, useEffect, useRef, useState } from 'react'

export type EventsState = {
  events: FeedEntry[]
  loading: boolean
  error: boolean
}

const POLL_MS = 30_000

/**
 * Loads the event feed and keeps it fresh: the service worker posts a message
 * on every push so an open app refetches immediately, with a slow poll as a
 * fallback when no SW message arrives (e.g. focus regained after sleep).
 */
export function useEvents() {
  const [state, setState] = useState<EventsState>({
    events: [],
    loading: true,
    error: false,
  })
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const events = await api.events()
      setState({ events, loading: false, error: false })
    } catch {
      setState((s) => ({ ...s, loading: false, error: true }))
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    load()

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'event') load()
    }
    const onFocus = () => load()

    navigator.serviceWorker?.addEventListener('message', onMessage)
    window.addEventListener('focus', onFocus)
    const timer = setInterval(load, POLL_MS)

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage)
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
  }, [load])

  return { ...state, reload: load }
}
