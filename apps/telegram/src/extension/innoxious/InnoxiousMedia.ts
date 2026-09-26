import { InputFile } from 'grammy'

type MediaSource = InputFile | string

export type MediaInput<F = InputFile> = {
  type: 'audio' | 'document' | 'photo' | 'video'
  media: F | string
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

const fetchUrl = async (url: string): Promise<InputFile> => {
  const response = await fetch(url, { method: 'GET' })
  if (!response.ok) throw new Error('Cannot retrieve event media from URL')
  return new InputFile(new Uint8Array(await response.arrayBuffer()))
}

/**
 * The most Telegram downloads itself from a URL; past it the URL is refused
 * with `failed to get HTTP URL content`. Decimal, to stay on the safe side.
 */
const URL_LIMIT: Record<MediaInput['type'], number> = {
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

/** A URL Telegram would refuse is sent as bytes without wasting an attempt. */
const resolveRemote = async (handler: MediaHandler): Promise<MediaSource> => {
  const url = handler.source as string
  const size = await probeSize(url)
  return size !== undefined && size > URL_LIMIT[handler.input.type]
    ? fetchUrl(url)
    : url
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

const fetchFile = async (path: string): Promise<InputFile> =>
  new InputFile(path)

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

const resolveNaiveSource = async (
  handler: MediaHandler,
): Promise<MediaSource> => {
  switch (handler.type) {
    case 'buffer':
      return handler.source
    case 'file':
      return fetchFile(handler.source)
    case 'local':
      return fetchUrl(handler.source)
    case 'remote':
      return resolveRemote(handler)
  }
}

const resolveAccurateSource = async (
  handler: MediaHandler,
): Promise<MediaSource> => {
  switch (handler.type) {
    case 'buffer':
      return handler.source
    case 'file':
      return fetchFile(handler.source)
    case 'local':
    case 'remote':
      return fetchUrl(handler.source)
  }
}

const resolveNaiveInput = async <Input extends MediaInput>(
  handler: MediaHandler,
): Promise<Input> =>
  ({ ...handler.input, media: await resolveNaiveSource(handler) }) as Input

const resolveAccurateInput = async <Input extends MediaInput>(
  handler: MediaHandler,
): Promise<Input> =>
  ({ ...handler.input, media: await resolveAccurateSource(handler) }) as Input

export class InnoxiousMedia<Input extends MediaInput> {
  protected readonly handler: MediaHandler<Input>
  private readonly naiveInput = memoize(() =>
    resolveNaiveInput<Input>(this.handler),
  )
  private readonly accurateInput = memoize(() =>
    resolveAccurateInput<Input>(this.handler),
  )

  constructor(input: Input) {
    this.handler = toMediaHandler(input)
  }

  naive(): Promise<Input> {
    return this.naiveInput.get()
  }

  accurate(): Promise<Input> {
    return this.accurateInput.get()
  }
}

export class InnoxiousMediaGroup<Input extends MediaInput> {
  protected readonly handlers: MediaHandler<Input>[]
  private readonly naiveInput = memoize(() =>
    Promise.all(this.handlers.map((h) => resolveNaiveInput<Input>(h))),
  )
  private readonly accurateInput = memoize(() =>
    Promise.all(this.handlers.map((h) => resolveAccurateInput<Input>(h))),
  )

  constructor(list: Input[]) {
    this.handlers = list.map(toMediaHandler)
  }

  naive(): Promise<Input[]> {
    return this.naiveInput.get()
  }

  accurate(): Promise<Input[]> {
    return this.accurateInput.get()
  }
}
