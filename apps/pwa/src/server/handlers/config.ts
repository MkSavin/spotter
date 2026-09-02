import type { CoreContext } from '../../context'
import { json } from '../http'

/**
 * Runtime settings the browser needs before it can do anything useful.
 *
 * Served rather than baked in at build time: the web app is compiled once into
 * the image, so a node already in production can be switched to verbose
 * tracing by restarting with `PWA_DEBUG=true` and no rebuild.
 */
export const configHandler = (context: CoreContext): Response =>
  // Coerced, not passed through: the client tests `=== true`, and shipping
  // `undefined` would drop the field from the JSON entirely.
  json({ debug: context.config.debug === true })
