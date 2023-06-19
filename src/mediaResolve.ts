import process from 'process'

export const resolveEventUrl = () => {
  const host = process.env.FRIGATE_HOST?.trim() ?? ''
  const normalizedHost = host.endsWith('/') ? host : `${host}/`
  // NOTE: double slash is intentionally left out
  return `${normalizedHost}/api/events`
}

export const resolveSnapshot = (id: string) => {
  const eventUrl = resolveEventUrl()
  return `${eventUrl}/${id}/snapshot.jpg`
}

export const resolveClip = (id: string) => {
  const eventUrl = resolveEventUrl()
  return `${eventUrl}/${id}/clip.mp4`
}
