import type { CoreContext } from '../../context'
import { json } from '../http'

/** Exposes the public VAPID key so the client subscribes without a build-time var. */
export const vapidHandler = (context: CoreContext): Response =>
  json({ publicKey: context.config.vapid.publicKey })
