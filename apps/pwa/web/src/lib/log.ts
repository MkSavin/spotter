/**
 * Flag arrives at runtime, not build time: the app is compiled once into the
 * image and tracing is wanted on a node already deployed.
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
