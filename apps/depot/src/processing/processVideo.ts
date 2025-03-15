import { env } from '@spotter/transport'
import ffmpeg from 'fluent-ffmpeg'
import { type ProcessFileContext, processFile } from './processFile'

type PresetAcceleration = 'cpu' | 'vaapi' | 'videotoolbox' | 'cuda'
type PresetCodec = 'h264' | 'hevc'
type PresetQuality = 'best' | 'good' | 'normal' | 'bad' | 'awful'

type ProcessorPreset = {
  name: string
  outputParameters: string[]
  inputParameters: string[]
}

const resolvePreset = (
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

const activePreset = resolvePreset(
  env.string('VIDEO_ACCELERATION', 'cpu'),
  env.string('VIDEO_CODEC', 'h264'),
  env.string('VIDEO_QUALITY', 'best'),
  env.number('VIDEO_DEVICE', 0),
)

const skipConversion = env.boolean('VIDEO_SKIP_CONVERSION', false)

export const processVideo = async (
  url: string | undefined,
  context: ProcessFileContext,
): Promise<string | undefined> => {
  return processFile(
    'video/mp4',
    url,
    context,
    async ({ raw, processed, context }) => {
      if (!raw?.name || !processed?.name) {
        throw new Error('Clip files is not assigned correctly')
      }

      if (skipConversion) {
        context.logger.debug('Conversion skipped due to configuration flag')
        await processed.write(await raw.arrayBuffer())
        return
      }

      await new Promise<void>((resolve, reject) => {
        context.logger.debug(`Using processing preset ${activePreset.name}`)
        context.logger.verbose('Preset options:', {
          input: activePreset.inputParameters,
          output: activePreset.outputParameters,
        })

        ffmpeg(raw.name)
          .inputOption(activePreset.inputParameters)
          .outputOptions(activePreset.outputParameters)
          // .size('1920x1080')
          // .fps(24)
          .noAudio()
          .format('mp4')
          .on('error', reject)
          .on('progress', (progress) => {
            context.logger.verbose(
              `Progress: ${progress.percent ?? 0}% / 100% (${progress.frames})`,
            )
          })
          .on('end', () => resolve())
          .save(processed.name)

        // TODO: add takeScreenshots() to replace snapshot with high-quality picture
      })

      context.logger.verbose('Processed image parameters', {
        format: processed.type,
        processed: {
          size: processed.size,
        },
        original: {
          size: raw.size,
        },
      })
    },
  )
}
