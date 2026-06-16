import QRCode from 'qrcode'

export const renderQr = (text: string): Promise<Buffer> =>
  QRCode.toBuffer(text, { type: 'png', width: 512, margin: 2 })
