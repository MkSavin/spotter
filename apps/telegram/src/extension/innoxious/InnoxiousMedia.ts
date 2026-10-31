import { tmpdir } from 'node:os'
import path from 'node:path'
import { InputFile } from 'grammy'
import { downloadToFile } from './resumableDownload'

type MediaSource = InputFile | string

export type MediaInput<F = InputFile> = {
  type: 'audio' | 'document' | 'photo' | 'video'
  media: F | string
}

export type MediaOptions = {
  /**
   * The most the Bot API takes as an upload. Telegram's own servers stop at
   * 50 MB; a self-hosted Bot API goes to 2000.
   */
  uploadLimit?: number
  /** Size when already known, so the storage is not asked for it. */
  size?: number
}

/** The default on Telegram's own servers. */
export const UPLOAD_LIMIT = 50_000_000

/** Not a delivery failure to retry: the file will not get smaller. */
export class MediaTooLargeError extends Error {
  constructor(
    readonly size: number,
    readonly limit: number,
  ) {
    super(`Media of ${size} bytes is over the ${limit} byte upload limit`)
  }
}

type MediaHandler<Input extends MediaInput = MediaInput> =
  | {
      source: InputFile
      input: Input
      type: 'buffer'
    }
  | {
      source: string
      input: Input
      type: 'file' | 'local' | 'remote'
    }

const localHostnames =
  /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/i

/**
 * The most Telegram downloads itself from a URL; past it the URL is refused
 * with `failed to get HTTP URL content`. Decimal, to stay on the safe side.
 */
export const URL_LIMIT: Record<MediaInput['type'], number> = {
  photo: 5_000_000,
  video: 20_000_000,
  audio: 20_000_000,
  document: 20_000_000,
}

/**
 * Size from a one-byte ranged GET: a presigned URL is signed for GET, so a
 * HEAD may be refused. `undefined` when the server will not say.
 */
const probeSize = async (url: string): Promise<number | undefined> => {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' } })
    await response.body?.cancel()
    const total = response.headers.get('content-range')?.split('/')[1]
    const size = Number(
      total ?? (response.ok ? response.headers.get('content-length') : NaN),
    )
    return Number.isFinite(size) ? size : undefined
  } catch {
    return undefined
  }
}

/** Cached while it holds: a failed read must be retried, not replayed. */
const memoize = <T>(read: () => Promise<T>): { get: () => Promise<T> } => {
  let pending: Promise<T> | undefined
  return {
    get: () => {
      if (!pending) {
        const attempt = read()
        pending = attempt
        attempt.catch(() => {
          if (pending === attempt) pending = undefined
        })
      }
      return pending
    },
  }
}

const toMediaHandler = <Input extends MediaInput>(
  input: Input,
): MediaHandler<Input> => {
  const source = input.media

  if (typeof source !== 'string') {
    return { source, input, type: 'buffer' }
  }

  try {
    const url = new URL(source)
    return {
      source,
      input,
      type: localHostnames.test(url.hostname) ? 'local' : 'remote',
    }
  } catch {
    return { source, input, type: 'file' }
  }
}

/**
 * One media item, resolved two ways: `naive` hands Telegram a URL where it
 * would accept one, `accurate` always hands it the bytes. A download lands in
 * a temp file, not memory: a clip may be hundreds of megabytes, and the file
 * can be resumed where the link to the storage is flaky. `dispose()` removes it.
 */
export class InnoxiousMedia<Input extends MediaInput> {
  protected readonly handler: MediaHandler<Input>
  private readonly uploadLimit: number
  private size: number | undefined
  /** Set only once a download was asked for: disposing must not start one. */
  private downloading: Promise<string> | undefined
  private readonly naiveInput = memoize(() => this.resolve('naive'))
  private readonly accurateInput = memoize(() => this.resolve('accurate'))

  constructor(input: Input, options: MediaOptions = {}) {
    this.handler = toMediaHandler(input)
    this.uploadLimit = options.uploadLimit ?? UPLOAD_LIMIT
    this.size = options.size
  }

  naive(): Promise<Input> {
    return this.naiveInput.get()
  }

  accurate(): Promise<Input> {
    return this.accurateInput.get()
  }

  /** Removes the downloaded file, if there is one. Safe to call twice. */
  async dispose(): Promise<void> {
    const pending = this.downloading
    if (!pending) return
    this.downloading = undefined
    const file = await pending.catch(() => undefined)
    if (file)
      await Bun.file(file)
        .delete()
        .catch(() => undefined)
  }

  /** Cached while it holds: a failed download must be retried, not replayed. */
  private downloaded(): Promise<string> {
    if (!this.downloading) {
      const attempt = this.download()
      this.downloading = attempt
      attempt.catch(() => {
        if (this.downloading === attempt) this.downloading = undefined
      })
    }
    return this.downloading
  }

  private async resolve(strategy: 'naive' | 'accurate'): Promise<Input> {
    return {
      ...this.handler.input,
      media: await this.source(strategy),
    } as Input
  }

  private async source(strategy: 'naive' | 'accurate'): Promise<MediaSource> {
    const { handler } = this
    switch (handler.type) {
      case 'buffer':
        return handler.source
      case 'file':
        return new InputFile(handler.source)
      case 'local':
        return new InputFile(await this.downloaded())
      case 'remote': {
        if (strategy === 'accurate') {
          return new InputFile(await this.downloaded())
        }
        const size = await this.measure(handler.source)
        if (size === undefined || size <= URL_LIMIT[handler.input.type]) {
          return handler.source
        }
        // A URL Telegram would refuse is sent as bytes without wasting an attempt.
        return new InputFile(await this.downloaded())
      }
    }
  }

  /** Known from the contract when possible: the storage link may be flaky. */
  private async measure(url: string): Promise<number | undefined> {
    this.size ??= await probeSize(url)
    this.assertFits(this.size)
    return this.size
  }

  private assertFits(size: number | undefined): void {
    if (size !== undefined && size > this.uploadLimit) {
      throw new MediaTooLargeError(size, this.uploadLimit)
    }
  }

  private async download(): Promise<string> {
    const url = this.handler.source as string
    this.assertFits(this.size)
    const file = path.join(
      tmpdir(),
      `spotter-telegram-${crypto.randomUUID()}${path.extname(new URL(url).pathname)}`,
    )
    try {
      const size = await downloadToFile(url, file)
      this.size = size
      this.assertFits(size)
      return file
    } catch (error) {
      await Bun.file(file)
        .delete()
        .catch(() => undefined)
      throw error
    }
  }
}

export class InnoxiousMediaGroup<Input extends MediaInput> {
  protected readonly items: InnoxiousMedia<Input>[]

  constructor(list: Input[], options: MediaOptions = {}) {
    this.items = list.map((input) => new InnoxiousMedia(input, options))
  }

  naive(): Promise<Input[]> {
    return Promise.all(this.items.map((item) => item.naive()))
  }

  accurate(): Promise<Input[]> {
    return Promise.all(this.items.map((item) => item.accurate()))
  }

  async dispose(): Promise<void> {
    await Promise.all(this.items.map((item) => item.dispose()))
  }
}
