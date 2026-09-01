import { type Requirement, type Role, satisfies } from '@spotter/transport'
import type { CoreContext } from '../context'
import { devicesRepo } from '../db/repository'
import type { DeviceRow } from '../db/schema'
import { json } from './http'

export type Authorized =
  | { ok: true; device: DeviceRow }
  | { ok: false; response: Response }

const bearer = (request: Request): string | null => {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  const token = header.slice('Bearer '.length).trim()
  return token || null
}

/**
 * Resolves the caller from its bearer token and checks its cached role.
 *
 * This gate is a convenience, not the security boundary: every command carries
 * the recipient's uuid and the server re-checks the role against the domain.
 * A device whose role was lowered still cannot act above it, even in the window
 * before the change reaches this cache.
 */
export const authorize = (
  request: Request,
  context: CoreContext,
  requirement: Requirement = 'authorized',
): Authorized => {
  const token = bearer(request)

  if (!token) {
    return {
      ok: false,
      response: json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  const device = devicesRepo.findByToken(context.db, token)

  if (!device) {
    return {
      ok: false,
      response: json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  if (!satisfies(requirement, device.role as Role)) {
    return {
      ok: false,
      response: json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, device }
}
