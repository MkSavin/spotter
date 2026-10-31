import { afterEach, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { downloadToFile } from './resumableDownload'

const payload = new Uint8Array(400_000)
for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251

type Reply = {
  status: number
  headers: Record<string, string>
  body: Uint8Array
  /** Whether to close the connection after the body; open means silence. */
  end: boolean
}

/**
 * A raw socket rather than `Bun.serve`: only a socket closed mid-body behaves
 * like a dropped link, and only a socket left open behaves like a stalled one.
 */
const serve = (behave: (from: number | undefined, calls: number) => Reply) => {
  const seen: (string | null)[] = []
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data(socket, data) {
        const head = Buffer.from(data).toString('latin1')
        if (!head.includes('\r\n\r\n')) return
        const from = /range: bytes=(\d+)-/i.exec(head)?.[1]
        seen.push(from ? `bytes=${from}-` : null)
        const reply = behave(from ? Number(from) : undefined, seen.length)
        // Status 0 means silence: the connection stays open with nothing on it.
        if (reply.status === 0) return
        socket.write(
          [
            `HTTP/1.1 ${reply.status} Whatever`,
            ...Object.entries(reply.headers).map(([k, v]) => `${k}: ${v}`),
            'connection: close',
            '',
            '',
          ].join('\r\n'),
        )
        socket.write(reply.body)
        if (reply.end) socket.end()
      },
    },
  })
  return {
    url: `http://127.0.0.1:${listener.port}/clip.mp4`,
    seen,
    stop: () => listener.stop(true),
  }
}

/** The file, or the rest of it from `from` on. */
const whole = (from = 0): Reply => ({
  status: from > 0 ? 206 : 200,
  headers:
    from > 0
      ? {
          'content-range': `bytes ${from}-${payload.length - 1}/${payload.length}`,
          'content-length': String(payload.length - from),
        }
      : { 'content-length': String(payload.length) },
  body: payload.slice(from),
  end: true,
})

/** Promises the whole file, sends the first `bytes`, then drops the link. */
const dropped = (bytes: number): Reply => ({
  status: 200,
  headers: { 'content-length': String(payload.length) },
  body: payload.slice(0, bytes),
  end: true,
})

/** Sends the first `bytes`, then goes silent. */
const silent = (bytes: number): Reply => ({
  status: 200,
  headers: { 'content-length': String(payload.length) },
  body: payload.slice(0, bytes),
  end: false,
})

const refused = (status: number): Reply => ({
  status,
  headers: { 'content-length': '2' },
  body: new TextEncoder().encode('no'),
  end: true,
})

const files: string[] = []
const target = () => {
  const file = path.join(tmpdir(), `spotter-download-${crypto.randomUUID()}`)
  files.push(file)
  return file
}

const contents = async (file: string) =>
  new Uint8Array(await Bun.file(file).arrayBuffer())

afterEach(() => {
  for (const file of files.splice(0)) rmSync(file, { force: true })
})

describe('downloadToFile', () => {
  test('resumes a dropped transfer from the byte it stopped at', async () => {
    const { url, seen, stop } = serve((from, calls) =>
      calls === 1 ? dropped(100_000) : whole(from),
    )
    try {
      const file = target()
      const size = await downloadToFile(url, file, { backoffMs: 1 })

      expect(size).toBe(payload.length)
      expect(await contents(file)).toEqual(payload)
      // Resumed, not restarted: the second request asks for the rest only,
      // from whatever had reached the disk before the link went.
      const resumedAt = Number(/bytes=(\d+)-/.exec(seen[1] ?? '')?.[1])
      expect(resumedAt).toBeGreaterThan(0)
      expect(resumedAt).toBeLessThanOrEqual(100_000)
    } finally {
      stop()
    }
  })

  test('gives up on silence, not on duration', async () => {
    const { url, stop } = serve((from, calls) =>
      calls === 1 ? silent(50_000) : whole(from),
    )
    try {
      const file = target()
      const size = await downloadToFile(url, file, {
        stallMs: 100,
        backoffMs: 1,
      })

      expect(size).toBe(payload.length)
      expect(await contents(file)).toEqual(payload)
    } finally {
      stop()
    }
  })

  test('starts over when the server ignores the range', async () => {
    const { url, stop } = serve((_from, calls) =>
      calls === 1 ? dropped(100_000) : whole(0),
    )
    try {
      const file = target()
      await downloadToFile(url, file, { backoffMs: 1 })

      expect(await contents(file)).toEqual(payload)
    } finally {
      stop()
    }
  })

  test('a connection that never answers is given up on and retried', async () => {
    const { url, stop } = serve((from, calls) =>
      calls === 1
        ? // Accepted, then nothing: not even headers.
          { status: 0, headers: {}, body: new Uint8Array(0), end: false }
        : whole(from),
    )
    try {
      const file = target()
      await downloadToFile(url, file, { stallMs: 100, backoffMs: 1 })

      expect(await contents(file)).toEqual(payload)
    } finally {
      stop()
    }
  })

  test('a refused link is not retried: a presigned URL does not come back', async () => {
    const { url, seen, stop } = serve(() => refused(403))
    try {
      await expect(
        downloadToFile(url, target(), { backoffMs: 1 }),
      ).rejects.toThrow('HTTP 403')
      expect(seen).toHaveLength(1)
    } finally {
      stop()
    }
  })

  test('a storage hiccup is retried', async () => {
    const { url, stop } = serve((from, calls) =>
      calls === 1 ? refused(503) : whole(from),
    )
    try {
      const file = target()
      await downloadToFile(url, file, { backoffMs: 1 })

      expect(await contents(file)).toEqual(payload)
    } finally {
      stop()
    }
  })

  test('stops resuming after the given attempts', async () => {
    const { url, seen, stop } = serve(() => dropped(1_000))
    try {
      await expect(
        downloadToFile(url, target(), { attempts: 2, backoffMs: 1 }),
      ).rejects.toThrow()
      expect(seen).toHaveLength(3)
    } finally {
      stop()
    }
  })
})
