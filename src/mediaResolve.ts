import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'

const constructUrl = (...parts: string[]): URL => {
  const url = new URL(process.env.FRIGATE_REMOTE_HOST ?? '')

  url.pathname = path.join('api', ...parts)

  return url
}

export const resolveLatestFrame = (camera: string) =>
  constructUrl(camera, 'latest.jpg').toString()

export const resolveEventFile = (id: string, filename: string): string =>
  constructUrl('events', id, filename).toString()
