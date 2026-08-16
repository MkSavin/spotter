import process from 'node:process'
import { hydrateApi, hydrateContext } from '@grammyjs/hydrate'
import { hydrateReply } from '@grammyjs/parse-mode'
import { run, sequentialize } from '@grammyjs/runner'
import {
  connectRedis,
  probeRedisVersion,
  type RegulatorHandle,
  StreamProducer,
  startHeartbeat,
} from '@spotter/transport'
import { RedisClient, S3Client } from 'bun'
import { Bot, session } from 'grammy'
import information from '../package.json'
import { registerClipCallback } from './callback/clipCallback'
import { CatalogCache } from './catalog/CatalogCache'
import { CommandBus } from './command/CommandBus'
import { commandRegistry } from './commands/commandList'
import {
  registerCommands,
  syncCommandMenu,
} from './commands/framework/registry'
import { registerUnknownCommand } from './commands/framework/unknownCommand'
import { resolveConfig } from './config'
import type { BotApi, BotContext, CoreContext } from './context'
import { createDatabase, type TelegramDatabase } from './db/client'
import { tgBindingsRepo } from './db/repository'
import { attachInnoxious } from './extension/innoxious/attachInnoxious'
import { timeout } from './helpers/timeout'
import { applicationLogger } from './log'
import { logging } from './middlewares/bot/logging'
import type { GlobalSession, UserSession } from './session'
import { HeartbeatRegistry } from './status/HeartbeatRegistry'
import { notifyRollout } from './status/notifyRollout'
import { RolloutWatcher } from './status/RolloutWatcher'
import { telegramTransport } from './transport/telegramTransport'

let db: TelegramDatabase | undefined

const initialize = async (
  coreContext: CoreContext,
): Promise<Bot<BotContext, BotApi>> => {
  const bot = new Bot<BotContext, BotApi>(coreContext.config.telegram.token)

  attachInnoxious(bot.api)

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

  // Cache all bindings at startup so each message doesn't require a DB round-trip.
  const listedBindings = tgBindingsRepo.list(coreContext.db)

  bot.use(
    session({
      type: 'multi',

      user: {
        initial: (): UserSession => ({
          authorizedRole: undefined,
          recipientUuid: undefined,
          needUpdateCommands: true,
        }),
        getSessionKey: (context) =>
          context.from === undefined || context.chat === undefined
            ? undefined
            : `${context.chat.id}@${context.from.id}`,
        prefix: 'user/',
      },

      global: {
        initial: (): GlobalSession => ({ events: {} }),
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
        const binding = listedBindings.find(
          (b) => b.tgUserId === userId && b.tgChatId === chatId,
        )
        context.session.user.authorizedRole = binding?.role
        context.session.user.recipientUuid = binding?.recipientUuid
      }

      next()
    },
  )

  return bot
}

const polling = async (): Promise<void> => {
  applicationLogger.info('Initializing spotter-telegram...')

  const config = resolveConfig()

  const database = createDatabase(config.database.path)
  db = database

  const s3 = new S3Client({
    endpoint: config.s3.host,
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
    bucket: config.s3.bucket,
  })

  const catalog = new CatalogCache(applicationLogger.sub('catalog'))
  const heartbeats = new HeartbeatRegistry(applicationLogger.sub('heartbeat'))

  // `bot` is built further down, but the first notice is a debounce away.
  let bot: Awaited<ReturnType<typeof initialize>> | undefined
  const rolloutLogger = applicationLogger.sub('rollout')
  const rollouts = new RolloutWatcher(database, rolloutLogger, {
    onRollout: (changes) =>
      bot && notifyRollout(bot.api, database, rolloutLogger, changes),
  })

  const subscriber = new RedisClient(config.redis.url)
  // Dedicated connection for the CommandBus reply poller.
  const commandSubscriber = new RedisClient(config.redis.url)

  const producer = new StreamProducer(
    new RedisClient(config.redis.url),
    config.redis.maxLen,
  )

  await producer.connect()
  await connectRedis(subscriber, { url: config.redis.url })
  await connectRedis(commandSubscriber, { url: config.redis.url })

  const stopHeartbeat = startHeartbeat(producer, {
    service: 'telegram',
    version: information.version,
    details: () => probeRedisVersion(producer),
  })

  await catalog.bootstrap(config.source, producer)

  const commandBus = new CommandBus(
    producer,
    commandSubscriber,
    applicationLogger.sub('command-bus'),
  )
  commandBus.start()

  let transport: RegulatorHandle | null = null

  const coreContext: CoreContext = {
    config,
    logger: applicationLogger,
    db: database,
    catalog,
    heartbeats,
    rollouts,
    s3,
    producer,
    subscriber,
    commandBus,
    runner: undefined,
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    if (coreContext.runner?.isRunning()) {
      applicationLogger.info(`Shutting down due to ${signal}...`)
      await coreContext.runner?.stop()
    }
    stopHeartbeat()
    rollouts.stop()
    commandBus.stop()
    await transport?.stop()
    subscriber.close()
    commandSubscriber.close()
    producer.disconnect()
    database.$client.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  bot = await initialize(coreContext)

  registerCommands(bot, commandRegistry)
  registerClipCallback(bot)
  bot.use(syncCommandMenu(commandRegistry))
  // Last: whatever reaches here matched no command above.
  registerUnknownCommand(bot, commandRegistry)

  applicationLogger.debug('Starting up...')

  coreContext.runner = run(bot, {})

  applicationLogger.debug('Bot is successfully started up!')

  await timeout(500)

  transport = await telegramTransport(bot, coreContext)

  applicationLogger.debug('Bot is successfully connected to message transport!')
}

polling().catch((error) => {
  applicationLogger.error(error)
  db?.$client.close()
  process.exit(1)
})
