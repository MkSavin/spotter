import { existsSync } from 'node:fs'
import path from 'node:path'

const distDir = [
  path.join(import.meta.dir, '..', '..', 'web', 'dist'),
  path.join(process.cwd(), 'web', 'dist'),
  path.join(process.cwd(), 'dist', 'web'),
].find((candidate) => existsSync(candidate))

const indexFile = distDir ? path.join(distDir, 'index.html') : undefined

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

  const url = new URL(request.url)
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname

  const candidate = path.join(distDir, pathname)
  if (candidate.startsWith(distDir)) {
    const file = Bun.file(candidate)
    if (await file.exists()) return new Response(file)
  }

  return new Response(Bun.file(indexFile), {
    headers: { 'content-type': 'text/html' },
  })
}
