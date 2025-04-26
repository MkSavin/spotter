import type {
  InputMediaAudio,
  InputMediaDocument,
  InputMediaPhoto,
  InputMediaVideo,
} from '@grammyjs/types/methods'
import { InputFile } from 'grammy'

type MediaSource = InputFile | string

export type MediaInput<F = InputFile> =
  | InputMediaDocument<F>
  | InputMediaAudio<F>
  | InputMediaPhoto<F>
  | InputMediaVideo<F>

type MediaHandler =
  | {
      source: InputFile
      input: MediaInput
      type: 'buffer'
    }
  | {
      source: string
      input: MediaInput
      type: 'file' | 'local' | 'remote'
    }

const localHostnames = /localhost|192\.168\.\d{1,3}\.\d{1,3}|127\.0\.0\.1/gi

const fetchUrl = async (url: string): Promise<InputFile> => {
  const response = await fetch(url, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error('Cannot retrieve event media from URL')
  }

  return new InputFile(new Uint8Array(await response.arrayBuffer()))
}

const fetchFile = async (path: string): Promise<InputFile> => {
  return new InputFile(path)
}

export class InnoxiousMedia {
  protected readonly handlers: MediaHandler[]

  private naivePromise: Promise<MediaInput[]> | undefined
  private accuratePromise: Promise<MediaInput[]> | undefined

  constructor(list: MediaInput[]) {
    this.handlers = list.map((input): MediaHandler => {
      const source = input.media

      if (typeof source !== 'string') {
        return {
          source,
          input,
          type: 'buffer',
        }
      }

      try {
        const url = new URL(source)

        return {
          source,
          input,
          type: localHostnames.test(url.hostname) ? 'local' : 'remote',
        }
      } catch {
        return {
          source,
          input,
          type: 'file',
        }
      }
    })
  }

  private async naiveSource(handler: MediaHandler): Promise<MediaSource> {
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

  private async accurateSource(handler: MediaHandler): Promise<MediaSource> {
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

  async naive(): Promise<MediaInput[]> {
    if (!this.naivePromise) {
      this.naivePromise = Promise.all(
        this.handlers.map(async (handler): Promise<MediaInput> => {
          return {
            ...handler.input,
            media: await this.naiveSource(handler),
          }
        }),
      )
    }

    return this.naivePromise
  }

  async accurate(): Promise<MediaInput[]> {
    if (!this.accuratePromise) {
      this.accuratePromise = Promise.all(
        this.handlers.map(async (handler): Promise<MediaInput> => {
          return {
            ...handler.input,
            media: await this.accurateSource(handler),
          }
        }),
      )
    }

    return this.accuratePromise
  }
}
