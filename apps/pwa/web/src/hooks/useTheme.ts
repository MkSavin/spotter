import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'spotter-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

const readStored = (): Theme => {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

const resolve = (theme: Theme): ResolvedTheme =>
  theme === 'system' ? (media.matches ? 'dark' : 'light') : theme

const apply = (theme: Theme): void => {
  document.documentElement.classList.toggle('dark', resolve(theme) === 'dark')
}

/** Notifies subscribers on stored-theme or system-preference change. */
const subscribe = (onChange: () => void): (() => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  media.addEventListener('change', onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    media.removeEventListener('change', onChange)
  }
}

/**
 * Theme state without a provider: `system` follows `prefers-color-scheme`,
 * explicit choices persist to localStorage. The `dark` class on `<html>` is
 * kept in sync so Tailwind's dark variant and shadcn tokens react instantly.
 */
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    readStored,
    (): Theme => 'system',
  )

  useEffect(() => apply(theme), [theme])

  const setTheme = useCallback((next: Theme) => {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
    apply(next)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  }, [])

  return { theme, resolved: resolve(theme), setTheme }
}
