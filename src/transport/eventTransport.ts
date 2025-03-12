import type { Bot } from 'grammy'
import type { Context, InitContext } from '../context'
import { feedEvent } from './event/feedEvent'

const subscribeToTopic = async (
  context: InitContext,
  topic: string,
): Promise<void> => {
  const mqtt = context.mqtt

  await new Promise<void>((resolve) => {
    if (mqtt.connected) {
      resolve()
      return
    }

    mqtt.on('connect', () => resolve())
  })

  await mqtt.subscribeAsync(topic)
}

export const eventTransport = async (
  bot: Bot<Context>,
  context: InitContext,
): Promise<void> => {
  const mqtt = context.mqtt

  await subscribeToTopic(context, 'frigate/events')

  const logger = context.logger.sub('transport')

  const propagatedContext = {
    ...context,
    logger,
  }

  const queue: any[] = []
  let dequeuing = false

  const dequeue = async (): Promise<void> => {
    if (dequeuing) {
      return
    }

    dequeuing = true
    while (queue.length > 0) {
      const message = queue.shift()
      await feedEvent(bot, propagatedContext, message)
    }
    dequeuing = false
  }

  mqtt.on('message', async (_, payload) => {
    const message = JSON.parse(payload.toString())
    queue.push(message)
    await dequeue()
  })
}
