import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useSyncExternalStore,
} from 'react'

const listeners = new Set<() => void>()

const notify = (): void => {
  for (const listener of listeners) listener()
}

/** SPA navigation via History API; `navigate` pushes and re-renders routes. */
export function navigate(path: string): void {
  if (path === window.location.pathname + window.location.search) return
  window.history.pushState({}, '', path)
  notify()
}

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('popstate', onChange)
  }
}

export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  )
}

/** Anchor that navigates client-side, falling back to a normal load on modifier-click. */
export function Link({
  href,
  children,
  className,
  onClick,
}: {
  href: string
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
        return
      }
      event.preventDefault()
      onClick?.()
      navigate(href)
    },
    [href, onClick],
  )

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  )
}
