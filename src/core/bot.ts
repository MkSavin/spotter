import process from 'node:process'
import TelegramBot from 'node-telegram-bot-api'
import { logger } from '../stenograph/log'

export const initBot = (): TelegramBot => {
  const token = process.env.TELEGRAM_TOKEN ?? ''

  logger.sub('init').info(`Connecting to Telegram Bot with token ${token}`)

  return new TelegramBot(token, { polling: true })
}
