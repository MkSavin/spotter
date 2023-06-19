import process from 'process'
import TelegramBot from 'node-telegram-bot-api'

export const initBot = (): TelegramBot => {
  const token = process.env.TELEGRAM_TOKEN ?? ''

  console.info(`Connecting to Telegram Bot with token ${token}`)

  return new TelegramBot(token, { polling: true })
}
