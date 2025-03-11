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

  mqtt.on('message', async (topic, payload) => {
    if (topic !== 'frigate/events') {
      return
    }

    // double-queued logic: firstly start events, then end events

    const message = payload.toString()
    queue.push(JSON.parse(message))
    await dequeue()
  })

  // Elercam Bot
  //
  // kafka.on('elercam/event/start', async (event) => {
  //   const contents = renderEvent('start', event)
  //   const messages = await Promise.all(
  //     chats.map((chatId) => (
  //       bot.replyWithHTML(chatId, contents)
  //         .then((message) => [ message.chatId, message.id ])
  //     ))
  //   )
  //   await redis.hSet('event:messages', event.id, messages)
  // })
  //
  // kafka.on('elercam/event/end', async (event) => {
  //   const contents = renderEvent('end', event)
  //   const messageList = await redis.hGet('event:messages', event.id)
  //   const c = differMessages(chats, messageList)
  //   await bot.editText(chatId, messageId, contents) // to all c
  //   await redis.hSet('event:messages', event.id, messages) // updateMessage list
  // })
  //
  // kafka.on('elercam/media/processed', async (event) => {
  //   const messageList = await redis.hGet('event:messages', event.id)
  //   const c = differMessages(chats, messageList)
  //   await bot.sendMediaGroup(chatId, [ event.clip, event.message ], { reply_to_message_id: message.id }) // to all c
  // })
  //
  // Elercam Event Sink
  //
  // mqtt.connect();
  // await mqtt.subscribeAsync('frigate/events')
  //
  // mqtt.on('message', (topic, contents) => {
  //   if (topic !== 'frigate/events') return
  //
  //   const event = validateEvent(contents)
  //   queue.push(event)
  //   await redis.sAdd('event:sent', event.id, event.id)
  // })
  //
  //
  //
  // Elercam Media Processor
  //
  // kafka.on('elercam/event/end', async (event) => {
  //   let clip
  //   let snapshot
  //
  //   if (event.has_clip) {
  //     clip = processClip(event.id)
  //   }
  //   if (event.has_snapshot) {
  //     clip = processSnapshot(event.id)
  //   }
  //
  //   kafka.pub('elercam/media/processed', { event, clip, snapshot })
  // })
}
