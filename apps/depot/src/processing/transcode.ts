import type { BunFile } from 'bun'
import ffmpeg from 'fluent-ffmpeg'
import type { Stenograph } from 'stenograph'
import type { ImageConfig, VideoConfig } from '../config'

type PresetAcceleration = 'cpu' | 'vaapi' | 'videotoolbox' | 'cuda'
type PresetCodec = 'h264' | 'hevc'
type PresetQuality = 'best' | 'good' | 'normal' | 'bad' | 'awful'

/** The shape fluent-ffmpeg emits on `codecData`; it ships no types for it. */
type FfmpegCodecData = {
  video?: string
  video_details?: string[]
  duration?: string
}

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
    /** case 'cpu-h264': */
    default:
      outputParameters = ['-tune:v zerolatency']
      encoder = 'libx264'
      break
  }

  switch (acceleration) {
    case 'cuda':
      /**
       * Decode on the GPU but hand nvenc ordinary frames.
       * See docs/foundings/ffmpeg-hardware-transcode.md.
       */
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
    /** case 'cpu': */
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
      /**
       * Without these nvenc silently picks a preset slower than the CPU.
       * See docs/foundings/ffmpeg-hardware-transcode.md.
       */
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
      /** vaapi has no -preset; quality is driven by the global quality knob. */
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
    /** case 'normal': */
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
    /** Tail of ffmpeg's stderr: the line naming the cause lives here. */
    readonly output: string[] = [],
    /** What ffmpeg made of the input, when it got that far. */
    readonly input?: string,
  ) {
    super(message)
  }
}

/** How many trailing stderr lines to keep for a failure report. */
const STDERR_TAIL = 12

/**
 * ffmpeg's own reading of the input stream, scraped from the stderr it already
 * writes. Cheaper than ffprobe, which would cost a second process per clip and
 * still could not see why the GPU refused.
 */
const describeInput = (data: FfmpegCodecData): string =>
  [data.video_details?.join(' ') ?? data.video, data.duration]
    .filter(Boolean)
    .join(' · ')

/**
 * Whether a failed hardware transcode is worth retrying on the CPU. Judged by
 * how far ffmpeg got, not by its wording: no frames means it died on the device
 * and the CPU may well succeed, while a timeout or a mid-stream failure points
 * at the input and would fail again, only slower.
 */
export const shouldRetryOnCpu = (error: unknown): boolean =>
  error instanceof TranscodeError && !error.timedOut && error.frames === 0

/**
 * The diagnosis a bare exit code cannot give: what the input was, and the
 * stderr lines around the failure. Which of those two is filled in already
 * narrows the cause — no input means ffmpeg died before opening the clip.
 */
export const describeFailure = (
  error: unknown,
): Record<string, unknown> | undefined => {
  if (!(error instanceof TranscodeError)) return undefined
  return {
    frames: error.frames,
    ...(error.input ? { input: error.input } : {}),
    ...(error.output.length > 0 ? { output: error.output } : {}),
  }
}

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
      // Logged here rather than by the caller: this is the last point that
      // still knows what ffmpeg said.
      logger.error(`Preset ${preset.name} failed`, describeFailure(error))
      throw error
    }
    // Losing the clip is worse than losing the speed-up. Warn loudly: a
    // silent fallback looks like working acceleration that is merely slow.
    logger.warn(
      `Preset ${preset.name} failed (${(error as Error).message}) — retrying on CPU`,
      describeFailure(error),
    )
    try {
      await runFfmpeg(
        rawPath,
        processedPath,
        fallback,
        video.timeoutMs,
        logger,
        onProgress,
      )
    } catch (fallbackError) {
      logger.error(
        `Preset ${fallback.name} failed`,
        describeFailure(fallbackError),
      )
      throw fallbackError
    }
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
  /** Only steps forward are reported: ffmpeg repeats and sometimes rewinds. */
  let reported = -1
  let input: string | undefined
  const output: string[] = []

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

    /**
     * Kill a stuck/overlong encode so the message can fail and be retried
     * cleanly instead of pinning a consumer until the reaper duplicates it.
     */
    const timer = setTimeout(() => {
      command.kill('SIGKILL')
      finish(() =>
        reject(
          new TranscodeError(
            `ffmpeg timed out after ${timeoutMs}ms`,
            frames,
            true,
            [...output],
            input,
          ),
        ),
      )
    }, timeoutMs)

    command
      .on('stderr', (line: string) => {
        // A ring, not a transcript: ffmpeg is chatty, and only the lines around
        // the failure say anything. `error` carries a truncated tail at best.
        const trimmed = line.trim()
        if (trimmed.length === 0) return
        output.push(trimmed)
        if (output.length > STDERR_TAIL) output.shift()
      })
      .on('codecData', (data: FfmpegCodecData) => {
        input = describeInput(data)
        logger.verbose(`Input stream: ${input}`)
      })
      .on('error', (error) =>
        finish(() =>
          reject(
            new TranscodeError(
              (error as Error).message,
              frames,
              false,
              [...output],
              input,
            ),
          ),
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
  /** Images convert in one shot; the parameter only keeps the two kinds alike. */
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

  const source = Bun.file(rawPath).image()
  /**
   * Dimensions come from the source: conversion never resizes, and reading
   * them back off disk would cost a second decode.
   */
  const { width, height } = await source.metadata()

  /**
   * Progressive keeps the output on par with libvips; Bun has no
   * `optimiseCoding`. See docs/foundings/ffmpeg-hardware-transcode.md.
   */
  const encoded = await source
    .jpeg({ quality: resolveImageQuality(image.quality), progressive: true })
    .bytes()

  await processed.write(encoded)

  logger.verbose('Processed image parameters', {
    format: 'jpeg',
    processed: { size: encoded.length, width, height },
    original: { size: raw.size },
  })
}
