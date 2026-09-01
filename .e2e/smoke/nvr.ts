/**
 * A Frigate stand-in that runs as a container, so services reach it by name
 * exactly as they reach the real one.
 *
 * Only the NVR is faked here: everything downstream — the images, the compose
 * wiring, the real Redis and S3 — is the deployment under test. Telegram is
 * pointed at this same server so a smoke run can never message a real chat.
 */
const PORT = Number(process.env.PORT ?? 8080)

const jpeg = new Uint8Array(4096)
// A JPEG magic number, enough for the pipeline to treat it as an image.
jpeg.set([0xff, 0xd8, 0xff, 0xe0])

let exportPolls = 0

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url)

    // --- Frigate ----------------------------------------------------------
    if (pathname === '/api/config') {
      return Response.json({
        cameras: { front: { enabled: true, objects: { track: ['person'] } } },
        objects: { track: ['person'] },
      })
    }

    if (pathname === '/api/version') return new Response('0.17.0-smoke')

    if (pathname.startsWith('/api/export/') && request.method === 'POST') {
      return Response.json({ success: true, export_id: 'front_smoke' })
    }

    if (pathname === '/api/exports') {
      exportPolls += 1
      return Response.json([
        {
          id: 'front_smoke',
          in_progress: exportPolls < 2,
          video_path: '/media/frigate/exports/front_smoke.mp4',
        },
      ])
    }

    if (pathname.startsWith('/api/events/')) {
      return Response.json({
        camera: 'front',
        start_time: Date.now() / 1000 - 10,
        end_time: Date.now() / 1000,
      })
    }

    // --- Telegram Bot API -------------------------------------------------
    // Every method answers ok, so the bot boots and its calls go nowhere real.
    if (pathname.includes('/bot')) {
      if (pathname.endsWith('/getMe')) {
        return Response.json({
          ok: true,
          result: { id: 1, is_bot: true, username: 'smoke_bot' },
        })
      }
      if (pathname.endsWith('/getUpdates')) {
        return Response.json({ ok: true, result: [] })
      }
      return Response.json({ ok: true, result: { message_id: 1 } })
    }

    // Media: snapshots, clips and finished exports.
    if (pathname.match(/\.(jpg|mp4)$/) || pathname.startsWith('/exports/')) {
      return new Response(jpeg)
    }

    return new Response('not found', { status: 404 })
  },
})

console.log(`fake nvr listening on ${server.port}`)
