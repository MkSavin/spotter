import { randomBytes } from 'node:crypto'
import type { BotDatabase } from '../db/client'
import { chatsRepo, tokensRepo, usersRepo } from '../db/repository'
import type { Role, User } from '../db/schema'
import { normalizeUsername } from '../helpers/username'

// Short, URL-safe access code. base64url of 9 bytes → 12 chars, well within the
// Telegram deep-link `start` limit (64 chars, [A-Za-z0-9_-]).
export const generateCode = (): string => randomBytes(9).toString('base64url')

// Telegram deep-link that auto-runs `/start <code>` when opened.
export const deepLink = (botUsername: string, code: string): string =>
  `https://t.me/${botUsername}?start=${code}`

export type RedeemInput = {
  userId: string
  chatId: string
  username: string | undefined
}

export type RedeemResult =
  | { ok: true; role: Role; user: User }
  | { ok: false; reason: 'not-found' | 'username-mismatch' }

// Core of /login and the /start deep-link: validates a code, optionally enforces
// the username binding, then provisions the chat + user with the granted role
// and consumes the single-use token. Pure over (db, input) for testability —
// session/reply updates stay in the command layer.
export const redeemToken = (
  db: BotDatabase,
  code: string,
  input: RedeemInput,
): RedeemResult => {
  const token = tokensRepo.find(db, code.trim())

  if (!token) {
    return { ok: false, reason: 'not-found' }
  }

  const username = input.username ? normalizeUsername(input.username) : null

  if (token.username && token.username !== username) {
    return { ok: false, reason: 'username-mismatch' }
  }

  chatsRepo.upsert(db, { id: input.chatId, token: code })

  const user = usersRepo.upsert(db, {
    id: input.userId,
    chatId: input.chatId,
    username,
    role: token.role,
    token: code,
  })

  tokensRepo.consume(db, token.id)

  return { ok: true, role: user.role, user }
}
