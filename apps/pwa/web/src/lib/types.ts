/** Mirror of the server's SpotterEvent — kept minimal for the feed UI. */
export type SpotterEvent = {
  id: string
  source?: string
  camera: string
  label: string | null
  startTime: number
  endTime: number | null
  score: number
  stationary: boolean
  hasClip: boolean
  hasSnapshot: boolean
  type: string
}

/** Feed entry from `GET /api/events` — media resolved to presigned URLs. */
export type FeedEntry = {
  eventId: string
  event: SpotterEvent
  snapshotUrl?: string
  clipUrl?: string
}

export type Role = 'VIEWER' | 'USER' | 'ADMIN'

/** One camera from the NVR catalog. */
export type CameraEntry = { code: string; label: string }

/** A service's last heartbeat, as the status screen shows it. */
export type ServiceStatus = {
  node: string
  service: string
  version: string
  at: number
  online: boolean
  uptime: number
  details?: Record<string, string>
}

export type TimelapseSpeed = 'realtime' | 'timelapse'

export type Timelapse = {
  id: string
  camera: string
  start: number
  end: number
  speed: TimelapseSpeed
  state: 'running' | 'ready' | 'failed'
  reason?: string
  videoUrl?: string
  createdAt: number
}

export type ManagedUser = {
  uuid: string
  role: Role
  username: string | null
  tgUserId: string | null
  deviceId: string | null
  authorizedAt: number | null
}

export type SubscriptionStatus = {
  endpoint: string
  authorized: boolean
  deviceLabel: string | null
}
