import type { Event } from '@prisma/client'
import Bun, { type BunFile } from 'bun'
import ffmpeg from 'fluent-ffmpeg'
import { type Bot, InputFile } from 'grammy'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/out/types.node'
import tmp, { type DirResult } from 'tmp'
import type { Context, InitContext } from '../../context'
import { frigateMedia } from '../../framework/api/Frigate'
import { processSnapshot } from '../../media/processing/processMedia'
import type { EventMessage } from '.prisma/client'

export type MediaTuple = {
  clip: Response | undefined
  snapshot: Response | undefined

  hasClip: boolean
  hasSnapshot: boolean
}

export const resolveMedia = async (
  event: Event,
  context: InitContext,
): Promise<MediaTuple> => {
  const clipResponse = event.has_clip
    ? await context.frigate.get(frigateMedia.event.clip, {
        id: event.id,
      })
    : undefined

  const snapshotResponse = event.has_snapshot
    ? await context.frigate.get(frigateMedia.event.clip, {
        id: event.id,
      })
    : undefined

  const hasClip = clipResponse?.status === 200
  const hasSnapshot = snapshotResponse?.status === 200

  context.logger.debug(
    `Clip ${hasClip ? '' : 'NOT '}found. Snapshot ${hasSnapshot ? '' : 'NOT '}found`,
  )

  return {
    clip: clipResponse,
    snapshot: snapshotResponse,

    hasClip,
    hasSnapshot,
  }
}

const resolveClip = async (
  context: InitContext,
  mediaResponse: Response,
): Promise<InputFile | null> => {
  const logger = context.logger.sub('clip-processing')

  const arrayBuffer = await mediaResponse.arrayBuffer()

  if (arrayBuffer.byteLength === 0) {
    logger.debug(`Clip "${mediaResponse.url}" buffer is empty, skipping...`)
    return null
  }

  let temporary: DirResult | undefined

  let raw: BunFile | undefined
  let processed: BunFile | undefined

  try {
    temporary = tmp.dirSync()

    logger.debug('Temporary directory used:', temporary.name)

    const hash = Bun.hash(mediaResponse.url)

    raw = Bun.file(`${temporary.name}/${hash}-raw.mp4`)
    processed = Bun.file(`${temporary.name}/${hash}-processed.mp4`)

    logger.debug('Starting file processing...', {
      raw,
      processed,
    })

    await Bun.write(raw, arrayBuffer, {
      createPath: true,
    })

    await new Promise<void>((resolve, reject) => {
      if (!raw?.name || !processed?.name) {
        reject(new Error('Clip files is not assigned correctly'))
        return
      }

      ffmpeg(raw.name)
        .addOptions(['-preset', 'superfast'])
        .videoCodec('libx264')
        .size('1920x1080')
        .noAudio()
        .format('mp4')
        .fps(24)
        .on('error', reject)
        .on('progress', (progress) => {
          logger.debug(
            `Progress: ${progress.percent}% / 100% (${progress.frames})`,
          )
        })
        .on('end', () => resolve())
        .save(processed.name)
    })

    logger.debug('File successfully processed!', {
      raw,
      processed,
    })

    return new InputFile(await processed.bytes())
  } catch (error) {
    logger.error(error)
  } finally {
    if (raw && (await raw.exists())) {
      await raw.delete()
    }
    if (processed && (await processed.exists())) {
      await processed.delete()
    }

    temporary?.removeCallback()
    logger.debug('Temporary directory removed')
  }

  return null
}

const resolveSnapshot = async (
  context: InitContext,
  mediaResponse: Response,
): Promise<InputFile | null> => {
  const logger = context.logger.sub('snapshot-processing')

  try {
    const processedBuffer = await processSnapshot(
      await mediaResponse.arrayBuffer(),
    )
    return new InputFile(processedBuffer)
  } catch (error) {
    logger.error(error)
  }

  return null
}

export const feedMedia = async (
  bot: Bot<Context>,
  context: InitContext,
  notifications: EventMessage[],
  mediaTuple: MediaTuple,
): Promise<void> => {
  const media: (InputMediaPhoto | InputMediaVideo)[] = []

  const snapshot =
    mediaTuple.hasSnapshot && mediaTuple.snapshot
      ? await resolveSnapshot(context, mediaTuple.snapshot)
      : null
  const clip =
    mediaTuple.hasClip && mediaTuple.clip
      ? await resolveClip(context, mediaTuple.clip)
      : null

  if (snapshot) {
    media.push({
      type: 'photo',
      media: snapshot,
    })
  }

  if (clip) {
    media.push({
      type: 'video',
      media: clip,
    })
  }

  if (media.length === 0) {
    return
  }

  // TODO: optimize with bucket-sending https://core.telegram.org/bots/api#sending-files
  await Promise.all(
    notifications.map((entry) =>
      bot.api.sendMediaGroup(entry.chat_id, media, {
        reply_to_message_id: entry.id,
      }),
    ),
  )
}
