export type SpotterEvent = {
  id: string
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
