import { ListenContext } from './index'
import dayjs from 'dayjs'
import console from 'console'
import { resolveClip, resolveSnapshot } from './mediaResolve'
import request from 'request'
import { objectLabels } from './objectLabels'
import {logger} from './stenograph/log'
import {User} from './models'

const eventSystemLogger = logger.sub('event')

export const listenTransport = (
  context: ListenContext,
) => {
  const {
    mqtt,
    loki,
  } = context

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

export const broadcastEvent = async (
  contents: any,
  context: ListenContext,
  users: Collection<User>,
) => {
  const {
    bot
  } = context

  const event = contents.after

  const dateTime = dayjs.unix(event.start_time)
  const formattedDateTime = dateTime.format('DD.MM.YYYY HH:mm:ss')

  const eventLogger = eventSystemLogger
    .sub(event.id + ' ' + formattedDateTime)
    .info('Event received.', 'Camera: ' + event.camera + ', object: ' + (event.stationary ? 'stationary' : 'non-stationary') + ' ' + event.label)

  for (const user of users.data) {
    const {
      chatId,
    } = user

    eventLogger.debug('Sent to user ', user.id)

    const objectLabel = objectLabels[event.label as keyof typeof objectLabels] ?? event.label

    const snapshotUrl = resolveSnapshot(event.id)
    const snapshotRemoteUrl = resolveSnapshot(event.id, true)
    const snapshotStream = request.get(snapshotUrl)
      .on('error', eventLogger.error)

    const clipUrl = resolveClip(event.id)
    const clipRemoteUrl = resolveClip(event.id, true)
    const clipStream = request.get(clipUrl)
      .on('error', eventLogger.error)

    try {
      const message = await bot.sendMessage(
        chatId,
        `<b>Обнаружено движение!</b> <a href="${snapshotRemoteUrl}">${event.id}</a>\n`
        + `👀 ${event.stationary ? 'Стац.' : 'Движ.'} <code>${objectLabel}</code> [${event.score}]\n`
        + `📆 <code>${formattedDateTime}</code> | 📹 <i>${event.camera}</i>\n`,
        {
          parse_mode: 'HTML',
        }
      )

      await bot.sendPhoto(
        chatId,
        snapshotStream,
        {
          reply_to_message_id: message.message_id,
          caption: `<a href="${snapshotRemoteUrl}">Снимок</a>`,
          parse_mode: 'HTML',
          disable_notification: true,
        },
        {
          filename: `snapshot-${event.id}.jpg`,
        }
      )

      await bot.sendVideo(
        chatId,
        clipStream,
        {
          reply_to_message_id: message.message_id,
          caption: `<a href="${clipRemoteUrl}">Видеоотрезок</a>`,
          parse_mode: 'HTML',
          disable_notification: true,
        },
        {
          filename: `clip-${event.id}.mp4`,
        }
      )
    } catch (error) {
      eventLogger.error(error)
    }
  }
}

export const listenEvent = async (
  contents: any,
  context: ListenContext,
  users: Collection<any>,
) => {
  const {
    loki,
  } = context

  const events = loki.getCollection('events')

  if (!events) {
    console.error('Database error. Events collection not found')
    return
  }

  if (contents.type === 'new') {
    events.insert({
      ...contents.after,
      type: contents.type,
    })
    return
  }

  events.findAndUpdate({
    id: contents.after.id,
  }, (contents) => ({
    ...contents.after,
    type: contents.type,
  }))

  // TODO: If the event has not ended within 10 seconds - send a notification about its start (new)
  if (contents.type === 'end') {
    await broadcastEvent(contents, context, users)
  }
}
