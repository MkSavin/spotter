/**
 * Stand-ins for what we do not own: the NVR, S3 and the push services.
 *
 * Everything inside Spotter runs for real against a real Redis. These are
 * faked because they are someone else's system — an NVR cannot be installed in
 * CI, and Telegram must never receive a message from a test run.
 */
/**
 * An in-memory S3. Reads matter as much as writes: depot stages bytes and then
 * fetches them back to transcode, so a write-only stub makes every media test
 * hang on an object that is never there.
 */
export type FakeS3 = {
  seedImage: (key: string) => Promise<void>
  presign: (key: string) => string
  file: (key: string) => {
    write: (data: unknown) => Promise<void>
    exists: () => Promise<boolean>
    arrayBuffer: () => Promise<ArrayBuffer>
  }
  /** Keys written so far, for asserting media really got staged. */
  keys: string[]
  store: Map<string, ArrayBuffer>
  /** Puts an object there without going through a service. */
  seed: (key: string, size?: number) => void
}

/**
 * A real 8x8 JPEG. Zero-filled bytes are not an image, and the transcoder
 * rightly refuses them — which would make every media test fail for a reason
 * that has nothing to do with the pipeline.
 */
let cachedImage: ArrayBuffer | null = null

const imageBytes = async (): Promise<ArrayBuffer> => {
  if (cachedImage) return cachedImage

  const sharp = (await import('sharp')).default
  const buffer = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 20, g: 40, b: 60 },
    },
  })
    .jpeg()
    .toBuffer()

  cachedImage = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer

  return cachedImage
}

const toBuffer = (data: unknown): ArrayBuffer => {
  if (data instanceof ArrayBuffer) return data
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer
  }
  if (typeof data === 'string') return new TextEncoder().encode(data).buffer
  return new ArrayBuffer(0)
}

export const fakeS3 = (): FakeS3 => {
  const keys: string[] = []
  const store = new Map<string, ArrayBuffer>()

  return {
    keys,
    store,
    seed: (key: string, size = 2048) => {
      store.set(key, new ArrayBuffer(size))
    },
    /** A decodable JPEG, for paths that really run an image transcoder. */
    seedImage: async (key: string) => {
      const encoded = await imageBytes()
      store.set(key, encoded)
    },
    presign: (key: string) => `https://s3.test/${key}?signed=1`,
    file: (key: string) => ({
      write: async (data: unknown) => {
        keys.push(key)
        store.set(key, toBuffer(data))
      },
      exists: async () => store.has(key),
      arrayBuffer: async () => store.get(key) ?? new ArrayBuffer(0),
    }),
  }
}

export type SentMessage = { chatId: string; text?: string; kind: string }

/** Telegram Bot API, recording instead of sending. */
export const fakeBotApi = () => {
  const sent: SentMessage[] = []

  return {
    sent,
    api: {
      sendMessage: async (chatId: string, text: string) => {
        sent.push({ chatId, text, kind: 'message' })
        return { message_id: sent.length }
      },
      sendPhoto: async (chatId: string) => {
        sent.push({ chatId, kind: 'photo' })
        return { message_id: sent.length }
      },
      sendVideo: async (chatId: string) => {
        sent.push({ chatId, kind: 'video' })
        return { message_id: sent.length }
      },
      editMessageText: async (chatId: string, _id: number, text: string) => {
        sent.push({ chatId, text, kind: 'edit' })
        return true
      },
      editMessageMedia: async (chatId: string) => {
        sent.push({ chatId, kind: 'edit-media' })
        return true
      },
      deleteMessage: async () => true,
    },
  }
}

export type FrigateBehaviour = {
  /** Fail every media fetch, to exercise the unavailable path. */
  mediaDown?: boolean
  /** Answer 404 for snapshots, as Frigate does for a sub-second event. */
  snapshotAbsent?: boolean
  /** How many polls an export takes before it reports finished. */
  exportPolls?: number
}

/** A Frigate stand-in: config, media and the export API. */
export const startFakeFrigate = async (
  port: number,
  behaviour: FrigateBehaviour = {},
) => {
  const requested: string[] = []
  let polls = 0

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url)
      const path = url.pathname
      requested.push(path)

      if (path === '/api/config') {
        return Response.json({
          cameras: {
            front: { enabled: true, objects: { track: ['person', 'car'] } },
            side: { enabled: false, objects: { track: ['person'] } },
          },
          objects: { track: ['person'] },
        })
      }

      if (path === '/api/version') return new Response('0.17.0')

      if (path.startsWith('/api/export/') && request.method === 'POST') {
        return Response.json({ success: true, export_id: 'front_e2e01' })
      }

      if (path === '/api/exports') {
        polls += 1
        return Response.json([
          {
            id: 'front_e2e01',
            in_progress: polls < (behaviour.exportPolls ?? 1),
            video_path: '/media/frigate/exports/front_e2e01.mp4',
          },
        ])
      }

      if (behaviour.mediaDown) return new Response('down', { status: 503 })

      if (path.includes('snapshot.jpg') && behaviour.snapshotAbsent) {
        return new Response('no snapshot', { status: 404 })
      }

      if (path.match(/\.(jpg|mp4)$/) || path.startsWith('/exports/')) {
        // Small but non-empty: staging rejects a zero-length body.
        return new Response(new Uint8Array(2048))
      }

      return new Response('not found', { status: 404 })
    },
  })

  return {
    url: `http://127.0.0.1:${port}`,
    requested,
    stop: () => server.stop(true),
  }
}
