import { existsSync } from 'node:fs'
import path from 'node:path'

const distDir = [
  path.join(import.meta.dir, '..', '..', 'web', 'dist'),
  path.join(process.cwd(), 'web', 'dist'),
  path.join(process.cwd(), 'dist', 'web'),
].find((candidate) => existsSync(candidate))

const indexFile = distDir ? path.join(distDir, 'index.html') : undefined

/** Path of a request URL, whether it arrived absolute or as a bare path. */
export const requestPathname = (url: string): string => {
  const { pathname } = new URL(url, 'http://localhost')
  return pathname === '/' ? '/index.html' : pathname
}

/**
 * Serves the built web app. Assets resolve to files under `web/dist`; anything
 * else falls back to `index.html` so client-side routing (deep links like
 * `/event/:id`) works on a full page load. Returns 503 until the app is built.
 */
export const serveStatic = async (request: Request): Promise<Response> => {
  if (!distDir || !indexFile) {
    return new Response('web app not built (run `bun run web:build`)', {
      status: 503,
    })
  }

  // `request.url` is normally absolute, but a request that arrives without a
  // usable Host header (HTTP/1.0, a bare proxy, some probes) leaves it as a
  // path. Parsing that unguarded throws, and the server's `error` handler
  // turns the throw into a 500 for a request that only wanted a page.
  const pathname = requestPathname(request.url)

  const candidate = path.join(distDir, pathname)
  if (candidate.startsWith(distDir)) {
    const file = Bun.file(candidate)
    if (await file.exists()) return new Response(file)
  }

  return new Response(Bun.file(indexFile), {
    headers: { 'content-type': 'text/html' },
  })
}
