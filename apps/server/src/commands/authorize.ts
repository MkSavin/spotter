import { satisfies } from '@spotter/transport'
import type { ServerDatabase } from '../db/client'
import { recipientsRepo } from '../db/repository'
import type { CommandAccess } from './handlers'

export type AuthorizeResult =
  | { ok: true }
  | { ok: false; error: 'forbidden' | 'unknown-kind' }

/**
 * Domain-side authorization for command RPCs: resolves the principal by UUID
 * and checks its role against the kind's required access. The frontend's own
 * gate is not trusted — a principal missing or below the bar is rejected.
 */
export const authorizeCommand = (
  db: ServerDatabase,
  kind: string,
  principalUuid: string | undefined,
  access: Record<string, CommandAccess>,
): AuthorizeResult => {
  const required = access[kind]
  if (!required) return { ok: false, error: 'unknown-kind' }

  if (required === 'anonymous') return { ok: true }

  const principal = principalUuid
    ? recipientsRepo.find(db, principalUuid)
    : undefined
  if (!principal) return { ok: false, error: 'forbidden' }

  return satisfies(required, principal.role)
    ? { ok: true }
    : { ok: false, error: 'forbidden' }
}
