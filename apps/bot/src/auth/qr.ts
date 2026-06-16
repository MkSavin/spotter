import QRCode from 'qrcode'

/** Renders text (a deep-link) as a PNG QR buffer for `replyWithPhoto`. */
export const renderQr = (text: string): Promise<Buffer> =>
  QRCode.toBuffer(text, { type: 'png', width: 512, margin: 2 })
