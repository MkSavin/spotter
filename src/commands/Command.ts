import type TelegramBot from 'node-telegram-bot-api'
import type { ListenContext } from '../index'
import type { User } from '../models'
import type { Stenograph } from '../stenograph/Stenograph'
import { logger } from '../stenograph/log'
import type { CommandRegistry } from './CommandRegistry'

export type CommandInitContext = ListenContext

export type CommandExecutionContext = ListenContext & {
  commandRegistry: CommandRegistry

  message: TelegramBot.Message
  match: RegExpExecArray | null

  authorizedUser: User | null
  chatId: number
}

export abstract class Command {
  abstract signature: string
  abstract description: string

  abstract regexp: RegExp

  logger: Stenograph

  constructor(_: CommandInitContext) {
    this.logger = logger
  }

  async testArguments(context: CommandExecutionContext): Promise<boolean> {
    return true
  }

  async authorize(context: CommandExecutionContext): Promise<boolean> {
    return true
  }

  abstract execute(context: CommandExecutionContext): Promise<void>
}
