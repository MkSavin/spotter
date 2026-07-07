import { env } from '@spotter/transport'
import type { BunFile } from 'bun'
import ffmpeg from 'fluent-ffmpeg'
import sharp from 'sharp'
import type { Stenograph } from 'stenograph'

type PresetAcceleration = 'cpu' | 'vaapi' | 'videotoolbox' | 'cuda'
type PresetCodec = 'h264' | 'hevc'
type PresetQuality = 'best' | 'good' | 'normal' | 'bad' | 'awful'

type ProcessorPreset = {
  name: string
  outputParameters: string[]
  inputParameters: string[]
}

const resolveVideoPreset = (
  acceleration: PresetAcceleration | string,
  codec: PresetCodec | string,
  quality: PresetQuality | string,
  device = 0,
): ProcessorPreset => {
  // Info: look https://github.com/blakeblackshear/frigate/blob/dev/frigate/ffmpeg_presets.py

  const preset = `${acceleration}-${codec}`

  let encoder: string

  let outputParameters: string[] = []
  let inputParameters: string[] = []

  switch (preset) {
    case 'cuda-hevc':
      encoder = 'hevc_nvenc'
      break
    case 'cuda-h264':
      encoder = 'h264_nvenc'
      break
    case 'vaapi-h264':
      encoder = 'h264_vaapi'
      break
    case 'vaapi-hevc':
      encoder = 'hevc_vaapi'
      break
    case 'videotoolbox-h264':
      outputParameters = ['-q:v 65']
      encoder = 'h264_videotoolbox'
      break
    case 'videotoolbox-hevc':
      outputParameters = ['-q:v 65']
      encoder = 'hevc_videotoolbox'
      break
    case 'cpu-hevc':
      outputParameters = ['-tune:v zerolatency']
      encoder = 'libx265'
      break
    // case 'cpu-h264':
    default:
      outputParameters = ['-tune:v zerolatency']
      encoder = 'libx264'
      break
  }

  switch (acceleration) {
    case 'cuda':
      inputParameters = [
        '-hide_banner',
        '-hwaccel cuda',
        '-hwaccel_output_format cuda',
        `-hwaccel_device ${device}`,
      ]
      break
    case 'vaapi':
      inputParameters = [
        '-hide_banner',
        '-hwaccel vaapi',
        '-hwaccel_output_format vaapi',
        `-hwaccel_device ${device}`,
      ]
      break
    case 'videotoolbox':
      inputParameters = ['-hide_banner']
      break
    // case 'cpu':
    default:
      inputParameters = ['-hide_banner']
      break
  }

  switch (acceleration) {
    case 'cpu': {
      const map: Record<PresetQuality, string[]> = {
        best: ['-preset:v normal'], //, '-crf 26'],
        good: ['-preset:v fast'], //, '-crf 26'],
        normal: ['-preset:v fast'], //, '-crf 28'],
        bad: ['-preset:v veryfast'], //, '-crf 30'],
        awful: ['-preset:v ultrafast'], //, '-crf 30'],
      }
      const qualityParameters =
        quality in map ? map[quality as keyof typeof map] : map.normal
      outputParameters.push(...qualityParameters)
      break
    }
    case 'videotoolbox': {
      const map: Record<PresetQuality, string[]> = {
        best: ['-q:v 100'],
        good: ['-q:v 90'],
        normal: ['-q:v 80'],
        bad: ['-q:v 65'],
        awful: ['-q:v 45'],
      }
      const qualityParameters =
        quality in map ? map[quality as keyof typeof map] : map.normal
      outputParameters.push(...qualityParameters)
      break
    }
    // no default
  }

  outputParameters.push(`-c:v ${encoder}`)

  return {
    name: preset,
    outputParameters,
    inputParameters,
  }
}

const activeVideoPreset = resolveVideoPreset(
  env.string('VIDEO_ACCELERATION', 'cpu'),
  env.string('VIDEO_CODEC', 'h264'),
  env.string('VIDEO_QUALITY', 'best'),
  env.number('VIDEO_DEVICE', 0),
)

const skipVideoConversion = env.boolean('VIDEO_SKIP_CONVERSION', false)

/**
 * Hard cap on a single ffmpeg run. A stuck encode never releases the message,
 * and once it idles past REDIS_RECLAIM_MIN_IDLE_MS the reaper would re-dispatch
 * a duplicate transcode — so keep this comfortably below that idle threshold.
 */
const videoTimeoutMs = env.number('VIDEO_TIMEOUT_MS', 120000)

const resolveImageQuality = (quality: PresetQuality | string): number => {
  switch (quality) {
    case 'best':
      return 100
    case 'good':
      return 90
    case 'bad':
      return 60
    case 'awful':
      return 50
    // case 'normal':
    default:
      return 80
  }
}

const activeImageQuality = resolveImageQuality(
  env.string('IMAGE_QUALITY', 'best'),
)
const skipImageConversion = env.boolean('IMAGE_SKIP_CONVERSION', false)

/** Transcodes a raw clip into the configured codec/quality, writing `processed`. */
export const transcodeVideo = async (
  raw: BunFile,
  processed: BunFile,
  logger: Stenograph,
): Promise<void> => {
  const rawPath = raw.name
  const processedPath = processed.name

  if (!rawPath || !processedPath) {
    throw new Error('Clip files is not assigned correctly')
  }

  if (skipVideoConversion) {
    logger.debug('Conversion skipped due to configuration flag')
    await processed.write(await raw.arrayBuffer())
    return
  }

  await new Promise<void>((resolve, reject) => {
    logger.debug(`Using processing preset ${activeVideoPreset.name}`)
    logger.verbose('Preset options:', {
      input: activeVideoPreset.inputParameters,
      output: activeVideoPreset.outputParameters,
    })

    const command = ffmpeg(rawPath)
      .inputOption(activeVideoPreset.inputParameters)
      .outputOptions(activeVideoPreset.outputParameters)
      .noAudio()
      .format('mp4')

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    // Kill a stuck/overlong encode so the message can fail and be retried
    // cleanly instead of pinning a consumer until the reaper duplicates it.
    const timer = setTimeout(() => {
      command.kill('SIGKILL')
      finish(() =>
        reject(new Error(`ffmpeg timed out after ${videoTimeoutMs}ms`)),
      )
    }, videoTimeoutMs)

    command
      .on('error', (error) => finish(() => reject(error)))
      .on('progress', (progress) => {
        logger.verbose(
          `Progress: ${progress.percent ?? 0}% / 100% (${progress.frames})`,
        )
      })
      .on('end', () => finish(() => resolve()))
      .save(processedPath)
  })

  logger.verbose('Processed video parameters', {
    format: processed.type,
    processed: { size: processed.size },
    original: { size: raw.size },
  })
}

/** Transcodes a raw image into the configured JPEG quality, writing `processed`. */
export const transcodeImage = async (
  raw: BunFile,
  processed: BunFile,
  logger: Stenograph,
): Promise<void> => {
  const rawPath = raw.name
  const processedPath = processed.name

  if (!rawPath || !processedPath) {
    throw new Error('Image files is not assigned correctly')
  }

  if (skipImageConversion) {
    logger.debug('Conversion skipped due to configuration flag')
    await processed.write(await raw.arrayBuffer())
    return
  }

  const output = await sharp(rawPath)
    .jpeg({ quality: activeImageQuality })
    .toFile(processedPath)

  logger.verbose('Processed image parameters', {
    format: output.format,
    processed: {
      size: output.size,
      width: output.width,
      height: output.height,
    },
    original: { size: raw.size },
  })
}
