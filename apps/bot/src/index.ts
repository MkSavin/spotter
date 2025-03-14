import process from 'node:process'
import { commands } from '@grammyjs/commands'
import { hydrate } from '@grammyjs/hydrate'
import { hydrateReply } from '@grammyjs/parse-mode'
import { run, sequentialize } from '@grammyjs/runner'
import { PrismaClient } from '@prisma/client'
import { Bot, session } from 'grammy'
import information from '../../../package.json'
import {
  adminCommands,
  allCommands,
  anonymousCommands,
  userCommands,
} from './commands/commandList'
import { resolveConfig } from './config'
import type { BotContext, CoreContext } from './context'
import { Frigate } from './framework/api/Frigate'
import { timeout } from './helpers/timeout'
import { authorize } from './middlewares/bot/authorize'
import { logging } from './middlewares/bot/logging'
import { switchCommandList } from './middlewares/bot/switchCommandList'
import type { Session } from './session'
import { eventTransport } from './transport/eventTransport'
import { Kafka, Partitioners } from 'kafkajs'
import { kafkaLogging } from '@spotter/transport'
import { applicationLogger } from './log'

const prisma = new PrismaClient()

const initialize = (coreContext: CoreContext): Bot<BotContext> => {
  const bot = new Bot<BotContext>(coreContext.config.telegram.token)

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

  bot.use(authorize)

  bot.use(hydrateReply, hydrate())

  bot.use(commands())

  const initial = (): Session => ({
    needUpdateCommands: true,
  })

  bot.use(
    session({
      initial,
      getSessionKey: (ctx) =>
        ctx.from === undefined || ctx.chat === undefined
          ? undefined
          : `${ctx.from.id}/${ctx.chat.id}`,
      prefix: 'user-',
    }),
  )

  return bot
}

const polling = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = await resolveConfig()

  const frigate = new Frigate()

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
    frigate,
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

  const bot = initialize(coreContext)

  bot.use(
    allCommands,
    switchCommandList({
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
