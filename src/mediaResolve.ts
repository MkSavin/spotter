import process from 'process'

export const resolveEventUrl = (remote = false) => {
  const host = (remote ? process.env.FRIGATE_REMOTE_HOST : process.env.FRIGATE_HOST)
    ?.trim() ?? ''

  const normalizedHost = host.endsWith('/') ? host : `${host}/`
  // NOTE: double slash is intentionally left out
  return `${normalizedHost}/api/events`
}

export const resolveSnapshot = (id: string, remote = false) => {
  const eventUrl = resolveEventUrl(remote)
  return `${eventUrl}/${id}/snapshot.jpg`
}

export const resolveClip = (id: string, remote = false) => {
  const eventUrl = resolveEventUrl(remote)
  return `${eventUrl}/${id}/clip.mp4`
}
