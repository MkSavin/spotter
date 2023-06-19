import { ListenContext } from './index'
import dayjs from 'dayjs'
import console from 'console'
import { resolveClip, resolveSnapshot } from './mediaResolve'
import request from 'request'
import { objectLabels } from './objectLabels'

export const listenTransport = (
  context: ListenContext,
) => {
  const {
    mqtt,
  } = context

  mqtt.on('message', (topic, payload) => {
    const message = payload.toString()
    const contents = JSON.parse(message)

    listenEvent(contents, context)
  })
}

export const broadcastEvent = (
  contents: any,
  context: ListenContext,
) => {
  const {
    loki,
    bot
  } = context

  const users = loki.getCollection('users')

  if (!users) {
    console.error('Database error. Users collection not found')
    return
  }

  users.data.forEach((user) => {
    const {
      chatId,
    } = user

    const event = contents.after

    const dateTime = dayjs.unix(event.start_time)
    const formattedDateTime = dateTime.format('DD.MM.YYYY HH:mm:ss')

    const objectLabel = objectLabels[event.label as keyof typeof objectLabels] ?? event.label

    bot.sendMessage(
      chatId,
      `**Обнаружено движение!** \[\`${event.id}\`\]\n\n`
      + `Время и дата: \`${formattedDateTime}\`\n`
      + `Камера: \`${event.camera}\`\n`
      + `Стационарность: \`${event.stationary ? 'да' : 'НЕТ'}\`\n`
      + `Точность: \`${event.score}\`\n`
      + `Объект: \`${objectLabel}\``,
      {
        parse_mode: 'Markdown',
      }
    )

    const snapshotStream = request.get(resolveSnapshot(event.id))
    const clipStream = request.get(resolveClip(event.id))

    bot.sendPhoto(
      chatId,
      snapshotStream,
      {
        caption: 'Снимок',
        disable_notification: true,
      },
    {
      filename: `snapshot-${event.id}.jpg`,
      contentType: 'application/octet-stream',
     }
    )

    bot.sendVideo(
      chatId,
      clipStream,
      {
        caption: 'Видеоотрезок',
        disable_notification: true,
      },
      {
        filename: `clip-${event.id}.mp4`,
        contentType: 'application/octet-stream',
      }
    )
  })
}

export const listenEvent = (
  contents: any,
  context: ListenContext,
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
    broadcastEvent(contents, context)
  }
}
