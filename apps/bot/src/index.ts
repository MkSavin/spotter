import process from 'node:process'
import { commands } from '@grammyjs/commands'
import { hydrateApi, hydrateContext } from '@grammyjs/hydrate'
import { hydrateReply } from '@grammyjs/parse-mode'
import { run, sequentialize } from '@grammyjs/runner'
import { type RegulatorHandle, StreamProducer } from '@spotter/transport'
import { RedisClient } from 'bun'
import { Bot, session } from 'grammy'
import information from '../../../package.json'
import {
  adminCommands,
  allCommands,
  anonymousCommands,
  generalCommands,
  userCommands,
} from './commands/commandList'
import { resolveConfig } from './config'
import type { BotApi, BotContext, CoreContext } from './context'
import { type BotDatabase, createDatabase } from './db/client'
import { usersRepo } from './db/repository'
import { constructEndpoint } from './endpoint/constructEndpoint'
import { attachInnoxious } from './extension/innoxious/attachInnoxious'
import { timeout } from './helpers/timeout'
import { applicationLogger } from './log'
import { logging } from './middlewares/bot/logging'
import { switchCommandList } from './middlewares/bot/switchCommandList'
import type { GlobalSession, UserSession } from './session'
import { eventTransport } from './transport/eventTransport'

let db: BotDatabase | undefined

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

  const listedUsers = usersRepo.list(coreContext.db)

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

  const database = createDatabase(config.database.path)
  db = database

  const nvr = constructEndpoint(config.nvr.type, config)

  // Dedicated blocking connection for XREADGROUP; the producer connection stays
  // free for XADD and the regulator's acks/reclaims.
  const subscriber = new RedisClient(config.redis.url)
  const producer = new StreamProducer(
    new RedisClient(config.redis.url),
    config.redis.maxLen,
  )

  await producer.connect()
  await subscriber.connect()

  let transport: RegulatorHandle | null = null

  const coreContext: CoreContext = {
    config,
    logger: applicationLogger,
    db: database,
    nvr,
    producer,
    subscriber,
    runner: undefined,
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    if (coreContext.runner?.isRunning()) {
      applicationLogger.info(`Shutting down due to ${signal}...`)
      await coreContext.runner?.stop()
    }
    await transport?.stop()
    subscriber.close()
    producer.disconnect()
    database.$client.close()
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

  transport = await eventTransport(bot, coreContext)

  applicationLogger.debug('Bot is successfully connected to message transport!')
}

polling().catch((error) => {
  applicationLogger.error(error)
  db?.$client.close()
  process.exit(1)
})
