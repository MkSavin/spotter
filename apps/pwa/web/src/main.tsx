import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { log, setDebug } from './lib/log'
import './styles/globals.css'

registerSW({ immediate: true })

// Fetched before the first render so the very first actions are traced too.
// A failure here must not keep the app from starting: tracing is a diagnostic,
// and losing it is far better than a blank screen.
try {
  const response = await fetch('/api/config')
  const { debug } = (await response.json()) as { debug?: boolean }
  setDebug(debug === true)
  log.debug('Runtime config loaded', { debug })
} catch (error) {
  log.warn('Could not load /api/config; debug logging stays off', error)
}

// Insecure contexts withhold Web Crypto and service workers, which breaks login
// in a way that looks like a bad code. Say so once, at startup.
if (typeof window !== 'undefined' && !window.isSecureContext) {
  log.warn(
    'Insecure context (no HTTPS): Web Crypto and service workers are unavailable, login will fail',
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
