import type TelegramBot from 'node-telegram-bot-api'
import type { ListenContext } from '../../index'
import { logger } from '../../log'
import type { User } from '../../models'
import type { FrigateAPI } from '../api/FrigateAPI'
import type { Stenograph } from '../stenograph/Stenograph'
import type { CommandRegistry } from './CommandRegistry'

export type CommandInitContext = ListenContext

export type CommandExecutionContext = ListenContext & {
  api: FrigateAPI
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

  constructor(_context: CommandInitContext) {
    this.logger = logger
  }

  async testArguments(_context: CommandExecutionContext): Promise<boolean> {
    return true
  }

  async authorize(_context: CommandExecutionContext): Promise<boolean> {
    return true
  }

  abstract execute(_context: CommandExecutionContext): Promise<void>
}
