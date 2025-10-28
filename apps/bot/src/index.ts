import process from 'node:process'
import { commands } from '@grammyjs/commands'
import { hydrateApi, hydrateContext } from '@grammyjs/hydrate'
import { hydrateReply } from '@grammyjs/parse-mode'
import { run, sequentialize } from '@grammyjs/runner'
import { kafkaLogging } from '@spotter/transport'
import { Bot, session } from 'grammy'
import { Kafka, Partitioners } from 'kafkajs'
import { PrismaClient } from '../../../.prisma-generated'
import information from '../../../package.json'
import {
  generalCommands,
  adminCommands,
  allCommands,
  anonymousCommands,
  userCommands,
} from './commands/commandList'
import { resolveConfig } from './config'
import type { BotApi, BotContext, CoreContext } from './context'
import { constructEndpoint } from './endpoint/constructEndpoint'
import { timeout } from './helpers/timeout'
import { applicationLogger } from './log'
import { attachInnoxious } from './extension/innoxious/attachInnoxious'
import { logging } from './middlewares/bot/logging'
import { switchCommandList } from './middlewares/bot/switchCommandList'
import type { GlobalSession, UserSession } from './session'
import { eventTransport } from './transport/eventTransport'

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
})

const initialize = async (
  coreContext: CoreContext,
): Promise<Bot<BotContext, BotApi>> => {
  const bot = new Bot<BotContext, BotApi>(coreContext.config.telegram.token)

  // Attach innoxious API helpers so code can call
  // bot.api.innoxious.sendMediaGroup(...)
  attachInnoxious(bot.api)

  // TODO: add testing with
  // client: { apiRoot: "http://localhost:8081" }, environment: 'test'

  bot.catch(applicationLogger.error)

  bot.use(logging)
  bot.use(async (context, next) => {
    Object.assign(context, coreContext)
    await next()
  })

  bot.use(
    sequentialize((context) => {
      const chat = context.chat?.id.toString()
      const user = context.from?.id.toString()
      return [chat, user].filter(Boolean) as string[]
    }),
  )

  bot.use(hydrateReply, hydrateContext())

  bot.api.config.use(hydrateApi())

  bot.use(commands())

  const listedUsers = await coreContext.prisma.user.findMany({
    select: {
      id: true,
      chatId: true,
      role: true,
    },
  })

  bot.use(
    session({
      type: 'multi',

      user: {
        initial: (): UserSession => ({
          authorizedRole: undefined,
          needUpdateCommands: true,
        }),
        getSessionKey: (context) =>
          context.from === undefined || context.chat === undefined
            ? undefined
            : `${context.chat.id}@${context.from.id}`,
        prefix: 'user/',
      },

      global: {
        initial: (): GlobalSession => ({
          events: {},
        }),
        getSessionKey: () => 'global',
      },
    }),
    (context, next) => {
      const userId = context.from?.id ? `${context.from.id}` : undefined
      const chatId = context.chatId ? `${context.chatId}` : undefined

      if (
        userId &&
        chatId &&
        context.session.user.authorizedRole === undefined
      ) {
        const user = listedUsers.find(
          (user) => user.id === userId && user.chatId === chatId,
        )
        context.session.user.authorizedRole = user?.role
      }

      next()
    },
  )

  return bot
}

const polling = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = await resolveConfig()

  const nvr = constructEndpoint(config.nvr.type, config)

  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    logCreator: kafkaLogging(applicationLogger),
  })

  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  })
  const consumer = kafka.consumer({
    groupId: config.kafka.groupId,
    heartbeatInterval: config.kafka.heartbeat,
    sessionTimeout: config.kafka.timeout * 2,
  })

  const coreContext: CoreContext = {
    config,
    logger: applicationLogger,
    prisma,
    nvr,
    producer,
    consumer,
    runner: undefined,
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    if (coreContext.runner?.isRunning()) {
      applicationLogger.info(`Shutting down due to ${signal}...`)
      await coreContext.runner?.stop()
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const bot = await initialize(coreContext)

  bot.use(
    allCommands,
    switchCommandList({
      general: generalCommands,
      anonymous: anonymousCommands,
      user: userCommands,
      admin: adminCommands,
    }),
  )

  applicationLogger.debug('Starting up...')

  coreContext.runner = run(bot, {})

  applicationLogger.debug('Bot is successfully started up!')

  // Wait bot+runner to fully startup before initializing transport
  await timeout(500)

  await eventTransport(bot, coreContext)

  applicationLogger.debug('Bot is successfully connected to message transport!')
}

polling().catch(async (error) => {
  applicationLogger.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
