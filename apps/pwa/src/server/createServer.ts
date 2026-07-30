import type { CoreContext } from '../context'
import { authHandler } from './handlers/auth'
import { eventHandler, eventsHandler } from './handlers/events'
import {
  subscribeHandler,
  subscriptionStatusHandler,
  testPushHandler,
  unsubscribeHandler,
} from './handlers/subscriptions'
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
      '/api/events': () => eventsHandler(context),
      '/api/events/:id': (req) => eventHandler(req.params.id, context),
    },
    fetch: (request) => serveStatic(request),
    error: (error) => {
      context.logger.error('unhandled request error', error)
      return json({ error: 'internal error' }, { status: 500 })
    },
  })
