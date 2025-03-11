import process from 'node:process'
import { commands } from '@grammyjs/commands'
import { hydrate } from '@grammyjs/hydrate'
import { hydrateReply } from '@grammyjs/parse-mode'
import { run, sequentialize } from '@grammyjs/runner'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { Bot, session } from 'grammy'
import mqtt from 'mqtt'
import { defaultLogger } from 'stenograph'
import information from '../../../package.json'
import {
  adminCommands,
  allCommands,
  anonymousCommands,
  userCommands,
} from './commands/commandList'
import { pullConfig } from './config'
import type { Context, InitContext } from './context'
import { Frigate } from './framework/api/Frigate'
import { timeout } from './helpers/timeout'
import { authorize } from './middlewares/bot/authorize'
import { logging } from './middlewares/bot/logging'
import { switchCommandList } from './middlewares/bot/switchCommandList'
import type { Session } from './session'
import { eventTransport } from './transport/eventTransport'

const logger = defaultLogger.sub('core')

dotenv.config()

const prisma = new PrismaClient()

const initialize = (initContext: InitContext): Bot<Context> => {
  const bot = new Bot<Context>(initContext.token)

  bot.catch(logger.error)

  bot.use(logging)
  bot.use(async (context, next) => {
    context.prisma = prisma
    context.frigate = initContext.frigate
    context.mqtt = initContext.mqtt
    context.content = {
      cameraLabels: initContext.cameraLabels,
      objectLabels: initContext.objectLabels,
    }
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
  const coreConfig = await pullConfig()

  logger.info(`Initializing ${information.name} v${information.version}...`)

  const mqttClient = mqtt.connect(coreConfig.mqttUrl)
  const frigate = new Frigate()

  const coreContext: InitContext = {
    ...coreConfig,
    logger: defaultLogger,
    prisma,
    mqtt: mqttClient,
    frigate,
    runner: undefined,
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    if (coreContext.runner?.isRunning()) {
      logger.info(`Shutting down due to ${signal}...`)
      await coreContext.runner?.stop()
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  logger.verbose('Using core configuration: ', coreConfig)

  const bot = initialize(coreContext)

  bot.use(
    allCommands,
    switchCommandList({
      anonymous: anonymousCommands,
      user: userCommands,
      admin: adminCommands,
    }),
  )

  logger.debug('Starting up...')

  coreContext.runner = run(bot, {})

  logger.debug('Bot is successfully started up!')

  // Wait bot+runner to fully startup before mqtt initializing transport
  await timeout(500)

  await eventTransport(bot, coreContext)

  logger.debug('Bot is successfully connected to mqtt transport!')
}

polling().catch(async (error) => {
  logger.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
