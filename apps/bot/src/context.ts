import type { CommandsFlavor } from '@grammyjs/commands'
import type { HydrateApiFlavor, HydrateFlavor } from '@grammyjs/hydrate'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { RunnerHandle } from '@grammyjs/runner'
import type { StreamProducer } from '@spotter/transport'
import type { AbortSignal } from 'abort-controller'
import type { RedisClient } from 'bun'
import type {
  Api,
  Bot,
  Context as GrammyContext,
  RawApi,
  SessionFlavor,
} from 'grammy'
import type { Message } from 'grammy/types'
import type { Stenograph } from 'stenograph'
import type { Config } from './config'
import type { BotDatabase } from './db/client'
import type { NvrEndpoint } from './endpoint/NvrEndpoint'
import type {
  InnoxiousMedia,
  InnoxiousMediaGroup,
} from './extension/innoxious/InnoxiousMedia'
import type { Session } from './session'

type Methods<R extends RawApi> = string & keyof R
type Payload<M extends Methods<R>, R extends RawApi> = M extends unknown
  ? R[M] extends (signal?: AbortSignal) => unknown
    ? // biome-ignore lint/complexity/noBannedTypes: External type
      {}
    : R[M] extends (args: any, signal?: AbortSignal) => unknown
      ? Parameters<R[M]>[0]
      : never
  : never
type Other<
  R extends RawApi,
  M extends Methods<R>,
  X extends string = never,
> = Omit<Payload<M, R>, X>

export type CoreContext = {
  config: Config

  logger: Stenograph

  db: BotDatabase
  nvr: NvrEndpoint
  subscriber: RedisClient
  producer: StreamProducer

  runner: RunnerHandle | undefined
}

export type BotContext = ParseModeFlavor<
  HydrateFlavor<
    CommandsFlavor<GrammyContext> & SessionFlavor<Session> & CoreContext
  >
>

type ChatId = number | string

export type InnoxiousApiFlavor<A extends Api> = A & {
  innoxious: {
    sendPhoto: (
      chatId: ChatId,
      media: InnoxiousMedia<any>,
      other?: Other<RawApi, 'sendPhoto', 'chat_id' | 'photo'>,
      signal?: AbortSignal,
    ) => Promise<Message.PhotoMessage>

    sendDocument: (
      chatId: ChatId,
      media: InnoxiousMedia<any>,
      other?: Other<RawApi, 'sendDocument', 'chat_id' | 'document'>,
      signal?: AbortSignal,
    ) => Promise<Message.DocumentMessage>

    sendVideo: (
      chatId: ChatId,
      media: InnoxiousMedia<any>,
      other?: Other<RawApi, 'sendVideo', 'chat_id' | 'video'>,
      signal?: AbortSignal,
    ) => Promise<Message.VideoMessage>

    sendMediaGroup: (
      chatId: ChatId,
      media: InnoxiousMediaGroup<any>,
      other?: Other<RawApi, 'sendMediaGroup', 'chat_id' | 'media'>,
      signal?: AbortSignal,
    ) => Promise<
      (
        | Message.PhotoMessage
        | Message.VideoMessage
        | Message.AudioMessage
        | Message.DocumentMessage
      )[]
    >
  }
}

export type BotApi = InnoxiousApiFlavor<HydrateApiFlavor<Api>>

export type TransportContext = CoreContext & {
  bot: Bot<BotContext, BotApi>
}
