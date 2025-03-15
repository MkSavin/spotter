import { env } from '@spotter/transport'
import sharp from 'sharp'
import { type ProcessFileContext, processFile } from './processFile'

type PresetQuality = 'best' | 'good' | 'normal' | 'bad' | 'awful'

type ProcessorPreset = {
  name: string
  quality: number
}

const resolvePreset = (quality: PresetQuality | string): ProcessorPreset => {
  let qualityPercent: number

  switch (quality) {
    case 'best':
      qualityPercent = 100
      break
    case 'good':
      qualityPercent = 90
      break
    case 'bad':
      qualityPercent = 60
      break
    case 'awful':
      qualityPercent = 50
      break
    // case 'normal':
    default:
      qualityPercent = 80
      break
  }

  return {
    name: quality,
    quality: qualityPercent,
  }
}

const activePreset = resolvePreset(env.string('IMAGE_QUALITY', 'best'))

const skipConversion = env.boolean('IMAGE_SKIP_CONVERSION', false)

export const processImage = async (
  url: string | undefined,
  context: ProcessFileContext,
): Promise<string | undefined> => {
  return processFile(
    'image/jpg',
    url,
    context,
    async ({ raw, processed, context }) => {
      if (skipConversion) {
        context.logger.debug('Conversion skipped due to configuration flag')
        await processed.write(await raw.arrayBuffer())
        return
      }

      const output = await sharp(raw.name)
        // .resize({
        //   width: 720,
        // })
        .jpeg({
          quality: activePreset.quality,
        })
        .toFile(processed.name)

      context.logger.verbose('Processed image parameters', {
        format: output.format,
        processed: {
          size: output.size,
          width: output.width,
          height: output.height,
        },
        original: {
          size: raw.size,
        },
      })
    },
  )
}
