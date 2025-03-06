import sharp from 'sharp'

export const processSnapshot = (buffer: ArrayBuffer): Promise<Buffer> => {
  return (
    sharp(buffer)
      // .resize({
      //   width: 720,
      // })
      .jpeg({
        quality: 80,
      })
      .toBuffer()
  )
}
