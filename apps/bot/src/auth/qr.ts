import QRCode from 'qrcode'

// Renders the given text (a Telegram deep-link) as a PNG QR code buffer, ready to
// send via `replyWithPhoto`/`sendPhoto`.
export const renderQr = (text: string): Promise<Buffer> =>
  QRCode.toBuffer(text, { type: 'png', width: 512, margin: 2 })
