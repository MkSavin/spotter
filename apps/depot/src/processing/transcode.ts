import type { BunFile } from 'bun'
import ffmpeg from 'fluent-ffmpeg'
import sharp from 'sharp'
import type { Stenograph } from 'stenograph'
import type { ImageConfig, VideoConfig } from '../config'

type PresetAcceleration = 'cpu' | 'vaapi' | 'videotoolbox' | 'cuda'
type PresetCodec = 'h264' | 'hevc'
type PresetQuality = 'best' | 'good' | 'normal' | 'bad' | 'awful'

type ProcessorPreset = {
  name: string
  outputParameters: string[]
  inputParameters: string[]
}

export const resolveVideoPreset = (
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
      // Decode on the GPU but hand nvenc ordinary frames: keeping them in VRAM
      // (`-hwaccel_output_format cuda`) needs a cuda filter chain, and without
      // one ffmpeg fails to negotiate a format and falls back to the CPU.
      inputParameters = [
        '-hide_banner',
        '-hwaccel cuda',
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
    case 'cuda': {
      // Without these nvenc silently uses p4/medium, which on a small Pascal
      // card is slower than the CPU it was meant to beat. `-cq` caps the size
      // the way CRF does; `ll` tuning matches Frigate's own presets.
      const map: Record<PresetQuality, string[]> = {
        best: ['-preset:v p4', '-cq:v 24'],
        good: ['-preset:v p3', '-cq:v 26'],
        normal: ['-preset:v p2', '-cq:v 28'],
        bad: ['-preset:v p1', '-cq:v 32'],
        awful: ['-preset:v p1', '-cq:v 36'],
      }
      const qualityParameters =
        quality in map ? map[quality as keyof typeof map] : map.normal
      outputParameters.push(...qualityParameters, '-tune:v ll', '-rc:v vbr')
      break
    }
    case 'vaapi': {
      // vaapi has no -preset; quality is driven by the global quality knob.
      const map: Record<PresetQuality, string[]> = {
        best: ['-global_quality 24'],
        good: ['-global_quality 26'],
        normal: ['-global_quality 28'],
        bad: ['-global_quality 32'],
        awful: ['-global_quality 36'],
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

/** Thrown when ffmpeg fails; carries what the retry decision needs. */
export class TranscodeError extends Error {
  constructor(
    message: string,
    readonly frames: number,
    readonly timedOut: boolean,
  ) {
    super(message)
  }
}

/**
 * Whether a failed hardware transcode is worth retrying on the CPU. Judged by
 * how far ffmpeg got, not by its wording: no frames means it died on the device
 * and the CPU may well succeed, while a timeout or a mid-stream failure points
 * at the input and would fail again, only slower.
 */
export const shouldRetryOnCpu = (error: unknown): boolean =>
  error instanceof TranscodeError && !error.timedOut && error.frames === 0

/** CPU fallback for when the configured hardware encoder is missing. */
const cpuFallbackPreset = (video: VideoConfig): ProcessorPreset =>
  resolveVideoPreset('cpu', video.codec, video.quality)

/** Reports transcoding completeness, already rounded to tens. */
export type ProgressReporter = (percent: number) => void

/** Transcodes a raw clip into the configured codec/quality, writing `processed`. */
export const transcodeVideo = async (
  raw: BunFile,
  processed: BunFile,
  video: VideoConfig,
  logger: Stenograph,
  onProgress?: ProgressReporter,
): Promise<void> => {
  const rawPath = raw.name
  const processedPath = processed.name

  if (!rawPath || !processedPath) {
    throw new Error('Clip files is not assigned correctly')
  }

  if (video.skipConversion) {
    logger.debug('Conversion skipped due to configuration flag')
    await processed.write(await raw.arrayBuffer())
    return
  }

  const preset = resolveVideoPreset(
    video.acceleration,
    video.codec,
    video.quality,
    video.device,
  )
  const fallback = cpuFallbackPreset(video)

  try {
    await runFfmpeg(
      rawPath,
      processedPath,
      preset,
      video.timeoutMs,
      logger,
      onProgress,
    )
  } catch (error) {
    if (preset.name === fallback.name || !shouldRetryOnCpu(error)) {
      throw error
    }
    // Losing the clip is worse than losing the speed-up. Warn loudly: a
    // silent fallback looks like working acceleration that is merely slow.
    logger.warn(
      `Preset ${preset.name} failed (${(error as Error).message}) — retrying on CPU`,
    )
    await runFfmpeg(
      rawPath,
      processedPath,
      fallback,
      video.timeoutMs,
      logger,
      onProgress,
    )
  }

  logger.verbose('Processed video parameters', {
    format: processed.type,
    processed: { size: processed.size },
    original: { size: raw.size },
  })
}

/** Rounds down to tens and clamps; ffmpeg can report past 100 or below zero. */
export const toProgressStep = (percent: number): number =>
  Math.min(100, Math.max(0, Math.floor(percent / 10) * 10))

const runFfmpeg = async (
  rawPath: string,
  processedPath: string,
  preset: ProcessorPreset,
  timeoutMs: number,
  logger: Stenograph,
  onProgress?: ProgressReporter,
): Promise<void> => {
  let frames = 0
  // Only steps forward are reported: ffmpeg repeats and sometimes rewinds.
  let reported = -1

  await new Promise<void>((resolve, reject) => {
    logger.debug(`Using processing preset ${preset.name}`)
    logger.verbose('Preset options:', {
      input: preset.inputParameters,
      output: preset.outputParameters,
    })

    const command = ffmpeg(rawPath)
      .inputOption(preset.inputParameters)
      .outputOptions(preset.outputParameters)
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
        reject(
          new TranscodeError(
            `ffmpeg timed out after ${timeoutMs}ms`,
            frames,
            true,
          ),
        ),
      )
    }, timeoutMs)

    command
      .on('error', (error) =>
        finish(() =>
          reject(new TranscodeError((error as Error).message, frames, false)),
        ),
      )
      .on('progress', (progress) => {
        frames = progress.frames ?? frames
        logger.verbose(
          `Progress: ${progress.percent ?? 0}% / 100% (${progress.frames})`,
        )
        if (progress.percent === undefined) return
        const step = toProgressStep(progress.percent)
        if (step <= reported) return
        reported = step
        onProgress?.(step)
      })
      .on('end', () => finish(() => resolve()))
      .save(processedPath)
  })
}

/** Transcodes a raw image into the configured JPEG quality, writing `processed`. */
export const transcodeImage = async (
  raw: BunFile,
  processed: BunFile,
  image: ImageConfig,
  logger: Stenograph,
  // Images convert in one shot; the parameter only keeps the two kinds alike.
  _onProgress?: ProgressReporter,
): Promise<void> => {
  const rawPath = raw.name
  const processedPath = processed.name

  if (!rawPath || !processedPath) {
    throw new Error('Image files is not assigned correctly')
  }

  if (image.skipConversion) {
    logger.debug('Conversion skipped due to configuration flag')
    await processed.write(await raw.arrayBuffer())
    return
  }

  const output = await sharp(rawPath)
    .jpeg({ quality: resolveImageQuality(image.quality) })
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
