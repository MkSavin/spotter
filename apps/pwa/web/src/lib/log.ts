/**
 * Browser-side tracing, off unless the server says otherwise.
 *
 * The flag arrives at runtime (`/api/config`, mirrored onto `window`) rather
 * than at build time: the web app is compiled once into the image, so a
 * `VITE_*` define could not be switched on for a node that is already
 * deployed — which is exactly when the tracing is needed.
 *
 * Warnings and errors are always printed. They are rare, and losing the one
 * line that explains a failed login is worse than a little console noise.
 */
type Fields = Record<string, unknown>

declare global {
  interface Window {
    __spotterDebug?: boolean
  }
}

const enabled = (): boolean =>
  typeof window !== 'undefined' && window.__spotterDebug === true

const stamp = (): string => new Date().toISOString().slice(11, 23)

const emit = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  fields?: Fields | unknown,
): void => {
  const prefix = `[pwa ${stamp()}] ${message}`
  if (fields === undefined) console[level](prefix)
  else console[level](prefix, fields)
}

export const log = {
  /** Fine-grained tracing: only with the flag on. */
  debug: (message: string, fields?: Fields | unknown): void => {
    if (enabled()) emit('debug', message, fields)
  },
  /** Milestones (session stored, request sent): only with the flag on. */
  info: (message: string, fields?: Fields | unknown): void => {
    if (enabled()) emit('info', message, fields)
  },
  warn: (message: string, fields?: Fields | unknown): void =>
    emit('warn', message, fields),
  error: (message: string, fields?: Fields | unknown): void =>
    emit('error', message, fields),
}

/** Turns tracing on for this page load. Called once, from the config fetch. */
export const setDebug = (value: boolean): void => {
  if (typeof window === 'undefined') return
  window.__spotterDebug = value
  if (value) emit('info', 'Debug logging enabled (PWA_DEBUG=true)')
}
