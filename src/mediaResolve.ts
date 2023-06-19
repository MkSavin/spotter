import process from 'process'

export const resolveEventUrl = () => {
  const host = process.env.FRIGATE_HOST
  // Note: first slash is not trimmable
  return `${host}/api/events`
}

export const resolveSnapshot = (id: string) => {
  const eventUrl = resolveEventUrl()
  return `${eventUrl}/${id}/snapshot.jpg`
}

export const resolveClip = (id: string) => {
  const eventUrl = resolveEventUrl()
  return `${eventUrl}/${id}/clip.mp4`
}
