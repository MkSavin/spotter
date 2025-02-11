import path from 'path'
import process from 'process'
import { URL } from 'url'

const constructUrl = (...parts: string[]): URL => {
  const url = new URL(process.env.FRIGATE_REMOTE_HOST ?? '')

  url.pathname = path.join('api', ...parts)

  return url
}

export const resolveEventFile = (id: string, filename: string): string => (
  constructUrl('events', id, filename).toString()
)

export const resolveSnapshot = (id: string): string => (
  constructUrl('events', id, 'snapshot.jpg').toString()
)

export const resolveClip = (id: string): string => (
  constructUrl('events', id, 'clip.mp4').toString()
)
