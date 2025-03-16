import type { CommandsFlavor } from '@grammyjs/commands'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { RunnerHandle } from '@grammyjs/runner'
import type { HeartbeatProps } from '@spotter/transport'
import type { Bot, SessionFlavor } from 'grammy'
import type { Context as GrammyContext } from 'grammy/out/context'
import type { Consumer, Producer } from 'kafkajs'
import type { Stenograph } from 'stenograph'
import type { Chat, PrismaClient, User } from '../../../.prisma-generated'
import type { Frigate } from './framework/api/Frigate'
import type { Session } from './session'

export type EnvironmentConfig = {
  kafka: HeartbeatProps & {
    clientId: string
    brokers: string[]
    groupId: string
  }
  telegram: {
    token: string
  }
  database: {
    url: string
  }
  frigate: {
    remoteUrl: string
  }
  media: {
    strategy: string
  }
}

export type ContentConfig = {
  objectLabels: Record<string, string>
  cameraLabels: Record<string, string>
}

export type Config = EnvironmentConfig & ContentConfig

export type CoreContext = {
  config: Config

  logger: Stenograph

  prisma: PrismaClient
  frigate: Frigate
  consumer: Consumer
  producer: Producer

  runner: RunnerHandle | undefined
}

export type AuthorizationContext = {
  user: User | null
  chat: Chat | null
}

export type ShiftedContext = CoreContext & {
  auth: AuthorizationContext | null
}

export type BotContext = ParseModeFlavor<
  HydrateFlavor<
    CommandsFlavor<GrammyContext> & SessionFlavor<Session> & ShiftedContext
  >
>

export type TransportContext = CoreContext & {
  bot: Bot<BotContext>
}
