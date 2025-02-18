import dayjs from 'dayjs'
import type { Collection } from 'lokijs'
import { FrigateAPI } from './framework/api/FrigateAPI'
import type { ListenContext } from './index'
import { logger } from './log'
import { resolveEventFile } from './mediaResolve'
import type { User } from './models'
import { objectLabels } from './objectLabels'

const eventSystemLogger = logger.sub('event')

export const broadcastEvent = async (
  contents: any,
  context: ListenContext,
  users: Collection<User>,
): Promise<void> => {
  const { bot } = context

  const event = contents.after

  const dateTime = dayjs.unix(event.start_time)
  const formattedDateTime = dateTime.format('DD.MM.YYYY HH:mm:ss')

  const eventLogger = eventSystemLogger
    .sub(`${event.id} ${formattedDateTime}`)
    .info(
      'Event received.',
      `Camera: ${event.camera}, object: ${event.stationary ? 'stationary' : 'non-stationary'} ${event.label}`,
    )

  const objectLabel =
    objectLabels[event.label as keyof typeof objectLabels] ?? event.label

  const api = new FrigateAPI()

  const snapshotFile = await api.get(resolveEventFile(event.id, 'snapshot.jpg'))
  const clipFile = await api.get(resolveEventFile(event.id, 'clip.mp4'))

  const sendToChat = async (chatId: number): Promise<void> => {
    const message = await bot.sendMessage(
      chatId,
      `<b>Обнаружено движение!</b> <a href="${snapshotFile.url}">${event.id}</a>\n` +
        `👀 ${event.stationary ? 'Стац.' : 'Движ.'} <code>${objectLabel}</code> [${event.score}]\n` +
        `📆 <code>${formattedDateTime}</code> | 📹 <i>${event.camera}</i>\n`,
      {
        parse_mode: 'HTML',
      },
    )

    await bot.sendMediaGroup(
      chatId,
      [
        {
          type: 'photo',
          // @ts-ignore
          media: Buffer.from(await snapshotFile.arrayBuffer()),
        },
        {
          type: 'video',
          // @ts-ignore
          media: Buffer.from(await clipFile.arrayBuffer()),
        },
      ],
      {
        disable_notification: true,
        reply_to_message_id: message.message_id,
      },
    )
  }

  await Promise.all(
    users.data.map(async (user) => {
      eventLogger.debug('Sent to user ', user.id)

      return sendToChat(user.chatId).catch((error) => {
        eventLogger.error(error.message)
      })
    }),
  )
}

export const listenEvent = async (
  contents: any,
  context: ListenContext,
  users: Collection,
): Promise<void> => {
  const { loki } = context

  const events = loki.getCollection('events')

  if (!events) {
    eventSystemLogger.error('Database error. Events collection not found')
    return
  }

  if (contents.type === 'new') {
    events.insert({
      ...contents.after,
      type: contents.type,
    })
    return
  }

  events.findAndUpdate(
    {
      id: contents.after.id,
    },
    (event) => ({
      ...event.after,
      type: event.type,
    }),
  )

  // TODO: If the event has not ended within 10 seconds - send a notification about its start (new)
  if (contents.type === 'end') {
    await broadcastEvent(contents, context, users)
  }
}

export const listenTransport = (context: ListenContext): void => {
  const { mqtt, loki } = context

  const users = loki.getCollection<User>('users')

  if (!users) {
    eventSystemLogger.error('Database error. Users collection not found')
    return
  }

  mqtt.on('message', async (_, payload) => {
    const message = payload.toString()
    const contents = JSON.parse(message)

    await listenEvent(contents, context, users)
  })
}
