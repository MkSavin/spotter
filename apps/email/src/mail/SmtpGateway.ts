import nodemailer, { type Transporter } from 'nodemailer'
import type { Stenograph } from 'stenograph'
import type { SmtpConfig } from '../config'

export type EmailMessage = {
  to: string[]
  subject: string
  text: string
  html: string
}

/**
 * Thin wrapper over a nodemailer SMTP transport. Isolates the provider so a
 * different backend (a self-hosted relay, a different provider) is a one-file
 * swap. Recipients go in `bcc` so mailboxes don't leak to each other.
 */
export class SmtpGateway {
  private readonly transporter: Transporter

  constructor(
    private readonly config: SmtpConfig,
    private readonly logger: Stenograph,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    })
  }

  /** Verifies the SMTP connection/credentials; throws on failure (fail-fast). */
  async verify(): Promise<void> {
    await this.transporter.verify()
    this.logger.debug(`SMTP transport ready (${this.config.host})`)
  }

  async send(message: EmailMessage): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.config.from,
      bcc: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })
    this.logger.debug(`Email sent: ${info.messageId}`)
  }
}
