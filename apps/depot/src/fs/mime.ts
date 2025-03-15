export const mimeExtensions = {
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/mp2t': 'ts',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
}

type MimeHelper = {
  extension: () => string
  type: 'image' | 'video'
}

export const mime = (mime: string): MimeHelper => {
  return {
    type: mime.includes('image') ? 'image' : 'video',
    extension: () =>
      mimeExtensions[mime as keyof typeof mimeExtensions] ?? undefined,
  }
}
