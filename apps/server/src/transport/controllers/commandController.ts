import {
  type CommandReply,
  type StreamMessageController,
  bufferToJson,
  deliveryStreams,
  safeParseCommandRequest,
} from '@spotter/transport'
import { commandHandlers } from '../../commands/handlers'
import type { ServerContext } from '../../context'

export const commandController: StreamMessageController<ServerContext> = async (
  payload,
  context,
): Promise<void> => {
  const { message } = payload
  const { logger: baseLogger, producer } = context

  const value = bufferToJson(message.value)
  if (!value) return

  const request = safeParseCommandRequest(value)
  if (!request) return

  const { requestId, kind, args } = request

  const logger = baseLogger.sub('command', kind, requestId.slice(0, 8))

  const handler = commandHandlers[kind]

  if (!handler) {
    logger.warn(`Unknown command kind "${kind}"`)
    const reply: CommandReply = {
      requestId,
      ok: false,
      error: `Unknown kind: ${kind}`,
    }
    await producer.publish(deliveryStreams.commandReply, reply)
    return
  }

  logger.debug(`Handling command "${kind}"`)

  try {
    const result = await handler(args, { ...context, logger })
    const reply: CommandReply = { requestId, ...result }
    await producer.publish(deliveryStreams.commandReply, reply)
    logger.debug(`Command "${kind}" succeeded`)
  } catch (error) {
    logger.error(`Command "${kind}" threw`, error)
    const reply: CommandReply = {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Internal error',
    }
    await producer.publish(deliveryStreams.commandReply, reply)
  }
}
