import process from 'node:process'
import dayjs from 'dayjs'
import signJWT from 'jwt-encode'
import type { Collection } from 'lokijs'
import request from 'request'
import type { ListenContext } from './index'
import { resolveEventFile } from './mediaResolve'
import type { User } from './models'
import { objectLabels } from './objectLabels'
import { logger } from './stenograph/log'

type ReceivedFileTuple = {
  url: string
  request: request.Request
}

const eventSystemLogger = logger.sub('event')

const receiveEventFile = (
  id: string,
  filename: string,
  context: {
    jwt: string
    onError: (...args: any[]) => void
  },
): ReceivedFileTuple => {
  const url = resolveEventFile(id, filename)

  return {
    url,
    request: request
      .get(url, {
        headers: {
          Authorization: `Bearer ${context.jwt}`,
        },
      })
      .on('error', context.onError),
  }
}

const generateJWT = (): string =>
  signJWT(
    {
      sub: process.env.FRIGATE_AUTH_USER,
      exp: dayjs().unix() + 60 * 60,
    },
    process.env.FRIGATE_AUTH_SECRET ?? '',
    {
      typ: 'JWT',
      alg: 'HS256',
    },
  )

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

  const jwt = generateJWT()

  const snapshotFile = receiveEventFile(event.id, 'snapshot.jpg', {
    jwt,
    onError: eventLogger.error,
  })
  const clipFile = receiveEventFile(event.id, 'clip.mp4', {
    jwt,
    onError: eventLogger.error,
  })

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

    // bot.sendMediaGroup(
    //   chatId,
    //   [
    //
    //   ],
    //   {
    //     disable_notification: true,
    //   }
    // )

    await bot.sendPhoto(
      chatId,
      snapshotFile.request,
      {
        reply_to_message_id: message.message_id,
        caption: `<a href="${snapshotFile.url}">Снимок</a>`,
        parse_mode: 'HTML',
        disable_notification: true,
      },
      {
        filename: `snapshot-${event.id}.jpg`,
      },
    )

    await bot.sendVideo(
      chatId,
      clipFile.request,
      {
        reply_to_message_id: message.message_id,
        caption: `<a href="${clipFile.url}">Видеоотрезок</a>`,
        parse_mode: 'HTML',
        disable_notification: true,
      },
      {
        filename: `clip-${event.id}.mp4`,
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
