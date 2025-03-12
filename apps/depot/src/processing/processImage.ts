import sharp from 'sharp'
import { type ProcessFileContext, processFile } from './processFile'

export const processImage = async (
  url: string | undefined,
  context: ProcessFileContext,
): Promise<string | undefined> => {
  return processFile(
    'image/jpg',
    url,
    context,
    async ({ raw, processed, context }) => {
      const output = await sharp(raw.name)
        // .resize({
        //   width: 720,
        // })
        .jpeg({
          quality: 80,
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
