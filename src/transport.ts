import { ListenContext } from './index'
import dayjs from 'dayjs'
import console from 'console'
import { resolveClip, resolveSnapshot } from './mediaResolve'
import request from 'request'
import { objectLabels } from './objectLabels'

const timeout = (ms: number) => (
    new Promise(resolve => setTimeout(resolve, ms))
)

export const listenTransport = (
  context: ListenContext,
) => {
  const {
    mqtt,
    loki,
  } = context

  const users = loki.getCollection('users')

  if (!users) {
    console.error('Database error. Users collection not found')
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
  users: Collection<any>,
) => {
  const {
    bot
  } = context

  for (const user of users.data) {
    const {
      chatId,
      mute,
    } = user

    if (mute !== undefined) {
      const muteTo = dayjs(mute)

      if (dayjs().isAfter(muteTo)) {
        users.update({
          ...user,
          mute: undefined,
        })
      } else {
        continue
      }
    }

    const event = contents.after

    const dateTime = dayjs.unix(event.start_time)
    const formattedDateTime = dateTime.format('DD.MM.YYYY HH:mm:ss')

    const objectLabel = objectLabels[event.label as keyof typeof objectLabels] ?? event.label

    const snapshotUrl = resolveSnapshot(event.id)
    const snapshotStream = request.get(snapshotUrl)

    const clipUrl = resolveClip(event.id)
    const clipStream = request.get(clipUrl)

    await timeout(1000)

    const message = await bot.sendMessage(
      chatId,
      `<b>Обнаружено движение!</b> [<code>${event.id}</code>]<br />`
      + `Дата и время: <code>${formattedDateTime}</code><br />`
      + `Камера: <code>${event.camera}</code><br />`
      + `Объект: <i>${event.stationary ? 'Стац.' : 'Движ.'}</i> <code>${objectLabel}</code> [<code>${event.score}</code>]`,
      {
        parse_mode: 'HTML',
      }
    )

    await bot.sendPhoto(
      chatId,
      snapshotStream,
      {
        reply_to_message_id: message.message_id,
        caption: `<a href="${snapshotUrl}">Снимок</a>`,
        parse_mode: 'HTML',
        disable_notification: true,
      },
      {
        filename: `snapshot-${event.id}.jpg`,
        contentType: 'application/octet-stream',
      }
    )

    await timeout(1000)

    await bot.sendVideo(
      chatId,
      clipStream,
      {
        reply_to_message_id: message.message_id,
        caption: `<a href="${clipUrl}">Видеоотрезок</a>`,
        parse_mode: 'HTML',
        disable_notification: true,
      },
      {
        filename: `clip-${event.id}.mp4`,
        contentType: 'application/octet-stream',
      }
    )
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
