import { createContext, type ReactNode, useContext } from 'react'
import { usePushSubscription } from './usePushSubscription'

type PushContextValue = ReturnType<typeof usePushSubscription>

const PushContext = createContext<PushContextValue | null>(null)

/** Shares one push-subscription state across the app (header + setup stay in sync). */
export function PushProvider({ children }: { children: ReactNode }) {
  const value = usePushSubscription()
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush(): PushContextValue {
  const value = useContext(PushContext)
  if (!value) throw new Error('usePush must be used within PushProvider')
  return value
}
