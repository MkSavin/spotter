import type { CommandsFlavor } from '@grammyjs/commands'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { RunnerHandle } from '@grammyjs/runner'
import type { Bot, SessionFlavor } from 'grammy'
import type { Context as GrammyContext } from 'grammy/out/context'
import type { Consumer, Producer } from 'kafkajs'
import type { Stenograph } from 'stenograph'
import type { PrismaClient } from '../../../.prisma-generated'
import type { Config } from './config'
import type { NvrEndpoint } from './endpoint/NvrEndpoint'
import type { Session } from './session'

export type CoreContext = {
  config: Config

  logger: Stenograph

  prisma: PrismaClient
  nvr: NvrEndpoint
  consumer: Consumer
  producer: Producer

  runner: RunnerHandle | undefined
}

export type BotContext = ParseModeFlavor<
  HydrateFlavor<
    CommandsFlavor<GrammyContext> & SessionFlavor<Session> & CoreContext
  >
>

export type TransportContext = CoreContext & {
  bot: Bot<BotContext>
}
