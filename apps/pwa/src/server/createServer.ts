import type { CoreContext } from '../context'
import { authHandler } from './handlers/auth'
import {
  camerasHandler,
  clipHandler,
  snapshotHandler,
  statusHandler,
} from './handlers/commands'
import { eventHandler, eventsHandler } from './handlers/events'
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
export const createServer = (context: CoreContext) =>
  Bun.serve({
    port: context.config.port,
    routes: {
      '/api/health': () => json({ ok: true }),
      '/api/vapid': () => vapidHandler(context),
      '/api/subscription': {
        GET: (req) => subscriptionStatusHandler(req, context),
      },
      '/api/subscribe': { POST: (req) => subscribeHandler(req, context) },
      '/api/unsubscribe': { POST: (req) => unsubscribeHandler(req, context) },
      '/api/test-push': { POST: (req) => testPushHandler(req, context) },
      '/api/auth': { POST: (req) => authHandler(req, context) },
      '/api/events': (req) => eventsHandler(req, context),
      '/api/events/:id': (req) => eventHandler(req, req.params.id, context),
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
    fetch: (request) => serveStatic(request),
    error: (error) => {
      context.logger.error('unhandled request error', error)
      return json({ error: 'internal error' }, { status: 500 })
    },
  })
