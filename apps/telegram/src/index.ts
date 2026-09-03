import process from 'node:process'
import { hydrateApi, hydrateContext } from '@grammyjs/hydrate'
import { hydrateReply } from '@grammyjs/parse-mode'
import { run, sequentialize } from '@grammyjs/runner'
import {
  CatalogCache,
  CommandBus,
  HeartbeatRegistry,
  probeRedisVersion,
  RedisConnection,
  type RegulatorHandle,
  readQueueDepths,
  StreamProducer,
  startHeartbeat,
  startLiveness,
  startRetention,
} from '@spotter/transport'
import { S3Client } from 'bun'
import { Bot, session } from 'grammy'
import information from '../package.json'
import { registerClipCallback } from './callback/clipCallback'
import { ClipTracker } from './clip/ClipTracker'
import { recoverClipWaits } from './clip/recoverClipWaits'
import { renderClipState } from './clip/renderClipState'
import { commandRegistry } from './commands/commandList'
import {
  registerCommands,
  syncCommandMenu,
} from './commands/framework/registry'
import {
  CommandThrottle,
  THROTTLE_SWEEP_MS,
} from './commands/framework/throttle'
import { registerUnknownCommand } from './commands/framework/unknownCommand'
import { resolveConfig } from './config'
import type { BotApi, BotContext, CoreContext } from './context'
import { catalogStore } from './db/catalogStore'
import { createDatabase, type TelegramDatabase } from './db/client'
import {
  clipWaitsRepo,
  dialogStatesRepo,
  eventMessagesRepo,
  tgBindingsRepo,
  timelapseWaitsRepo,
} from './db/repository'
import { DIALOG_TTL_MS } from './dialog/Dialog'
import { DialogRegistry } from './dialog/DialogRegistry'
import { attachInnoxious } from './extension/innoxious/attachInnoxious'
import { timeout } from './helpers/timeout'
import { applicationLogger } from './log'
import { logging } from './middlewares/bot/logging'
import type { GlobalSession, UserSession } from './session'
import { notifyRollout } from './status/notifyRollout'
import { RolloutWatcher } from './status/RolloutWatcher'
import { telegramTransport } from './transport/telegramTransport'

let db: TelegramDatabase | undefined

const initialize = async (
  coreContext: CoreContext,
): Promise<Bot<BotContext, BotApi>> => {
  const { token, apiRoot, testEnvironment } = coreContext.config.telegram

  const bot = new Bot<BotContext, BotApi>(token, {
    client: {
      ...(apiRoot ? { apiRoot } : {}),
      ...(testEnvironment ? { environment: 'test' as const } : {}),
    },
  })

  if (apiRoot) applicationLogger.warn(`Bot API redirected to ${apiRoot}`)
  if (testEnvironment)
    applicationLogger.warn('Using the Telegram test environment')

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
          dialog: undefined,
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

  const catalog = new CatalogCache(
    applicationLogger.sub('catalog'),
    catalogStore(database),
  )
  const heartbeats = new HeartbeatRegistry(applicationLogger.sub('heartbeat'))

  // `bot` is built further down, but the first notice is a debounce away.
  let bot: Awaited<ReturnType<typeof initialize>> | undefined
  const rolloutLogger = applicationLogger.sub('rollout')
  const rollouts = new RolloutWatcher(database, rolloutLogger, {
    onRollout: (changes) =>
      bot && notifyRollout(bot.api, database, rolloutLogger, changes),
  })

  const clipLogger = applicationLogger.sub('clip')
  const clips = new ClipTracker(clipLogger, {
    render: (eventId, outcome) =>
      bot &&
      renderClipState(bot.api, database, clipLogger, eventId, outcome).catch(
        (error) => clipLogger.warn(`Clip repaint failed: ${error}`),
      ),
    store: {
      save: (eventId, stage) => clipWaitsRepo.save(database, eventId, stage),
      remove: (eventId) => clipWaitsRepo.remove(database, eventId),
    },
  })

  const subscriber = new RedisConnection(config.redis.url)
  // Dedicated connection for the CommandBus reply poller.
  const commandSubscriber = new RedisConnection(config.redis.url)

  const producer = new StreamProducer(
    new RedisConnection(config.redis.url),
    config.redis.maxLen,
  )

  await producer.connect()
  await subscriber.connect()
  await commandSubscriber.connect()

  // Declared before the heartbeat that reads it: the first beat fires
  // immediately, and a `let` further down would still be in its dead zone.
  let transport: RegulatorHandle | null = null

  const stopHeartbeat = startHeartbeat(producer, {
    service: 'telegram',
    version: information.version,
    details: () => probeRedisVersion(producer),
    // Read at beat time: the regulator is created further down.
    queues: async () =>
      transport
        ? readQueueDepths(producer, transport.streams, config.redis.group)
        : [],
  })

  // Healthcheck signal: refreshed only while Redis actually answers, so a
  // wedged-but-running container fails its healthcheck and gets restarted.
  const stopLiveness = startLiveness({
    check: async () => {
      await subscriber.send('PING', [])
      return true
    },
  })

  const stopDialogRetention = startRetention({
    label: 'stale dialog',
    retentionMs: DIALOG_TTL_MS,
    prune: (cutoff) => dialogStatesRepo.prune(database, cutoff),
    logger: applicationLogger,
  })

  const throttle = new CommandThrottle()

  // The map only holds one entry per (chat, command) inside its window, but a
  // busy bot still accumulates them; sweeping keeps it bounded.
  const stopThrottleSweep = startRetention({
    label: 'throttle entry',
    retentionMs: THROTTLE_SWEEP_MS,
    prune: () => throttle.sweep(THROTTLE_SWEEP_MS),
    logger: applicationLogger,
    intervalMs: THROTTLE_SWEEP_MS,
  })

  const stopWaitRetention = startRetention({
    label: 'timelapse wait',
    retentionMs: config.retention.messageDays * 24 * 60 * 60 * 1000,
    prune: (cutoff) => timelapseWaitsRepo.prune(database, cutoff),
    logger: applicationLogger,
  })

  const stopMessageRetention = startRetention({
    label: 'event message',
    retentionMs: config.retention.messageDays * 24 * 60 * 60 * 1000,
    prune: (cutoff) => eventMessagesRepo.prune(database, cutoff),
    logger: applicationLogger,
  })

  await catalog.bootstrap(config.source, producer)

  const commandBus = new CommandBus(
    producer,
    commandSubscriber,
    applicationLogger.sub('command-bus'),
  )
  commandBus.start()

  const coreContext: CoreContext = {
    config,
    logger: applicationLogger,
    db: database,
    catalog,
    heartbeats,
    rollouts,
    clips,
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
    stopLiveness()
    stopDialogRetention()
    stopMessageRetention()
    stopWaitRetention()
    stopThrottleSweep()
    rollouts.stop()
    clips.stop()
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

  const dialogs = new DialogRegistry()
  for (const command of commandRegistry) {
    if (command.args.length > 0) dialogs.register(command.dialog())
  }

  // Before commands: a frozen button from the previous life must not outlive
  // the restart that caused it.
  await recoverClipWaits(database, clipLogger, (eventId, outcome) =>
    renderClipState(bot.api, database, clipLogger, eventId, outcome),
  ).catch((error) => clipLogger.warn(`Clip wait recovery failed: ${error}`))

  registerCommands(bot, commandRegistry, throttle)
  registerClipCallback(bot)
  dialogs.callbacks(bot)
  // Before unknownCommand, which would otherwise swallow the reply.
  dialogs.input(bot)
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
