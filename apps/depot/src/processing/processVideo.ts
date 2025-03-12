import ffmpeg from 'fluent-ffmpeg'
import { env } from '../helpers/env'
import { type ProcessFileContext, processFile } from './processFile'

type PresetAcceleration = 'cpu' | 'vaapi' | 'cuda' | string
type PresetCodec = 'h264' | 'hevc' | string

type VideoProcessorPreset = {
  name: string
  outputParameters: string[]
  inputParameters: string[]
}

const resolvePreset = (
  acceleration: PresetAcceleration,
  codec: PresetCodec,
  device = 0,
): VideoProcessorPreset => {
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
    case 'cpu-hevc':
      outputParameters = ['-preset:v ultrafast', '-tune:v zerolatency']
      encoder = 'libx265'
      break
    // case 'cpu-h264':
    default:
      outputParameters = ['-preset:v ultrafast', '-tune:v zerolatency']
      encoder = 'libx264'
      break
  }

  outputParameters.push(`-c:v ${encoder}`)

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
    // case 'cpu':
    default:
      inputParameters = ['-hide_banner']
      break
  }

  return {
    name: preset,
    outputParameters,
    inputParameters,
  }
}

export const activePreset = resolvePreset(
  env.string('VIDEO_ACCELERATION', 'cpu'),
  env.string('VIDEO_CODEC', 'h264'),
  env.number('VIDEO_DEVICE', 0),
)

export const processVideo = async (
  url: string | undefined,
  context: ProcessFileContext,
): Promise<string | undefined> => {
  return processFile(
    'video/mp4',
    url,
    context,
    async ({ raw, processed, context }) => {
      await new Promise<void>((resolve, reject) => {
        if (!raw?.name || !processed?.name) {
          reject(new Error('Clip files is not assigned correctly'))
          return
        }

        context.logger.debug(`Using processing preset ${activePreset.name}`)

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
