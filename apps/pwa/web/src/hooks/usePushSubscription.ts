import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  currentEndpoint,
  isStandalone,
  pushSupported,
  subscribeDevice,
  unsubscribeDevice,
} from '@/lib/push'

export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export type PushState = {
  supported: boolean
  standalone: boolean
  permission: PermissionState
  subscribed: boolean
  authorized: boolean
  deviceLabel: string | null
  loading: boolean
}

const readPermission = (): PermissionState =>
  pushSupported() ? (Notification.permission as PermissionState) : 'unsupported'

/**
 * Single source of truth for the device's push state: platform support,
 * install (standalone) status, notification permission, whether this device is
 * subscribed and authorized. Exposes subscribe/unsubscribe/authorize actions.
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushState>({
    supported: pushSupported(),
    standalone: isStandalone(),
    permission: readPermission(),
    subscribed: false,
    authorized: false,
    deviceLabel: null,
    loading: true,
  })

  const refresh = useCallback(async () => {
    if (!pushSupported()) {
      setState((s) => ({ ...s, loading: false, permission: 'unsupported' }))
      return
    }

    const endpoint = await currentEndpoint()
    const status = endpoint
      ? await api.subscriptionStatus(endpoint).catch(() => null)
      : null

    setState((s) => ({
      ...s,
      permission: readPermission(),
      standalone: isStandalone(),
      subscribed: Boolean(status?.subscribed),
      authorized: Boolean(status?.authorized),
      deviceLabel: status?.deviceLabel ?? null,
      loading: false,
    }))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const subscribe = useCallback(async (deviceLabel?: string) => {
    const result = await subscribeDevice(deviceLabel)
    setState((s) => ({
      ...s,
      permission: readPermission(),
      subscribed: true,
      authorized: result.authorized,
      deviceLabel: result.deviceLabel,
    }))
    return result
  }, [])

  const unsubscribe = useCallback(async () => {
    await unsubscribeDevice()
    setState((s) => ({
      ...s,
      subscribed: false,
      authorized: false,
      deviceLabel: null,
    }))
  }, [])

  return { ...state, refresh, subscribe, unsubscribe }
}
