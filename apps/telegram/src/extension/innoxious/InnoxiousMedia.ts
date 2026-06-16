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
      return handler.source
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

export const innoxiousHelpers = {
  toMediaHandler,
  resolveNaiveSource,
  resolveAccurateSource,
}

export class InnoxiousMedia<Input extends MediaInput> {
  protected readonly handler: MediaHandler<Input>
  private naivePromise: Promise<Input> | undefined
  private accuratePromise: Promise<Input> | undefined

  constructor(input: Input) {
    this.handler = toMediaHandler(input)
  }

  async naive(): Promise<Input> {
    if (!this.naivePromise) this.naivePromise = resolveNaiveInput(this.handler)
    return this.naivePromise
  }

  async accurate(): Promise<Input> {
    if (!this.accuratePromise)
      this.accuratePromise = resolveAccurateInput(this.handler)
    return this.accuratePromise
  }
}

export class InnoxiousMediaGroup<Input extends MediaInput> {
  protected readonly handlers: MediaHandler<Input>[]
  private naivePromise: Promise<Input[]> | undefined
  private accuratePromise: Promise<Input[]> | undefined

  constructor(list: Input[]) {
    this.handlers = list.map(toMediaHandler)
  }

  async naive(): Promise<Input[]> {
    if (!this.naivePromise)
      this.naivePromise = Promise.all(
        this.handlers.map((h) => resolveNaiveInput<Input>(h)),
      )
    return this.naivePromise
  }

  async accurate(): Promise<Input[]> {
    if (!this.accuratePromise)
      this.accuratePromise = Promise.all(
        this.handlers.map((h) => resolveAccurateInput<Input>(h)),
      )
    return this.accuratePromise
  }
}
