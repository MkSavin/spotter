import type { CoreContext } from '../context'
import { authHandler } from './handlers/auth'
import {
  camerasHandler,
  clipHandler,
  snapshotHandler,
  statusHandler,
} from './handlers/commands'
import { configHandler } from './handlers/config'
import { eventHandler, eventsHandler } from './handlers/events'
import { mediaHandler } from './handlers/media'
import {
  subscribeHandler,
  subscriptionStatusHandler,
  testPushHandler,
  unsubscribeHandler,
} from './handlers/subscriptions'
import { startTimelapseHandler, timelapsesHandler } from './handlers/timelapses'
import {
  revokeHandler,
  setRoleHandler,
  signHandler,
  usersHandler,
} from './handlers/users'
import { vapidHandler } from './handlers/vapid'
import { json } from './http'
import { serveStatic } from './static'

/**
 * Single Bun.serve process: JSON REST API under `/api/*`, everything else
 * served from the built web app (with SPA fallback for deep links).
 */
export const createServer = (context: CoreContext) => {
  const trace = context.logger.sub('http')

  /**
   * Wraps a route so every API call is traced with its status and duration.
   * Off unless PWA_DEBUG is set: on a busy node this is one line per request.
   */
  const traced =
    <T extends unknown[]>(
      name: string,
      handler: (...args: T) => Response | Promise<Response>,
    ) =>
    async (...args: T): Promise<Response> => {
      if (!context.config.debug) return handler(...args)
      const started = Date.now()
      try {
        const response = await handler(...args)
        trace.info(`${name} → ${response.status} (${Date.now() - started}ms)`)
        return response
      } catch (error) {
        trace.error(`${name} threw after ${Date.now() - started}ms`, error)
        throw error
      }
    }

  return Bun.serve({
    port: context.config.port,
    routes: {
      '/api/health': () => json({ ok: true }),
      '/api/vapid': () => vapidHandler(context),
      '/api/config': traced('GET /api/config', () => configHandler(context)),
      '/api/subscription': {
        GET: (req) => subscriptionStatusHandler(req, context),
      },
      '/api/subscribe': { POST: (req) => subscribeHandler(req, context) },
      '/api/unsubscribe': { POST: (req) => unsubscribeHandler(req, context) },
      '/api/test-push': { POST: (req) => testPushHandler(req, context) },
      '/api/auth': {
        POST: traced('POST /api/auth', (req: Request) =>
          authHandler(req, context),
        ),
      },
      '/api/events': (req) => eventsHandler(req, context),
      '/api/events/:id': (req) => eventHandler(req, req.params.id, context),
      // Media is proxied, not presigned: see handlers/media.ts.
      '/api/events/:id/snapshot': (req) =>
        mediaHandler(req, req.params.id, 'snapshot', context),
      '/api/events/:id/clip': (req) =>
        mediaHandler(req, req.params.id, 'clip', context),
      '/api/cameras': (req) => camerasHandler(req, context),
      '/api/status': (req) => statusHandler(req, context),
      '/api/snapshot': { POST: (req) => snapshotHandler(req, context) },
      '/api/clip': { POST: (req) => clipHandler(req, context) },
      '/api/timelapses': {
        GET: (req) => timelapsesHandler(req, context),
        POST: (req) => startTimelapseHandler(req, context),
      },
      '/api/users': { GET: (req) => usersHandler(req, context) },
      '/api/users/role': { POST: (req) => setRoleHandler(req, context) },
      '/api/users/revoke': { POST: (req) => revokeHandler(req, context) },
      '/api/users/sign': { POST: (req) => signHandler(req, context) },
    },
    fetch: (request) => {
      if (context.config.debug) trace.info(`static ${request.url}`)
      return serveStatic(request)
    },
    error: (error) => {
      context.logger.error('unhandled request error', error)
      return json({ error: 'internal error' }, { status: 500 })
    },
  })
}
