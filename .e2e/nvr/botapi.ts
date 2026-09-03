/**
 * A recording stand-in for Telegram's Bot API.
 *
 * The bot is the one part of the chain a rig cannot exercise for real without
 * a token and a live chat. Pointing grammY's `apiRoot` here closes that gap:
 * the bot boots, sends what it would send, and the rig can assert on the
 * calls — a run can never reach a real chat.
 *
 * Every method answers `ok`, because the point is what the bot *tried* to do.
 * What it tried is kept in memory and served from `/__calls`.
 */
const PORT = Number(process.env.PORT ?? 8090)

type Call = { method: string; body: unknown; at: number }

const calls: Call[] = []

/** grammY sends multipart for media and JSON for everything else. */
const readBody = async (request: Request): Promise<unknown> => {
  const type = request.headers.get('content-type') ?? ''

  try {
    if (type.includes('application/json')) return await request.json()

    if (type.includes('multipart/form-data')) {
      const form = await request.formData()
      return Object.fromEntries(
        [...form.entries()].map(([key, value]) => [
          key,
          // File parts are the media itself; their size is what matters here,
          // and keeping the bytes would grow this without bound.
          value instanceof File ? `<file ${value.size} bytes>` : value,
        ]),
      )
    }

    const text = await request.text()
    return text ? { raw: text } : {}
  } catch {
    return {}
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url)

    if (pathname === '/__calls') {
      const method = searchParams.get('method')
      const matching = method
        ? calls.filter((call) => call.method === method)
        : calls
      return Response.json({ count: matching.length, calls: matching })
    }

    if (pathname === '/__reset') {
      calls.length = 0
      return Response.json({ ok: true })
    }

    // Bot API paths look like /bot<token>/<method>, or /bot<token>/test/<method>
    // against Telegram's test infrastructure.
    const method = pathname.split('/').filter(Boolean).at(-1) ?? ''

    if (method === 'getMe') {
      return Response.json({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Rig',
          username: 'rig_bot',
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
        },
      })
    }

    // Long polling: answer empty rather than hanging, so the bot idles quietly.
    if (method === 'getUpdates') return Response.json({ ok: true, result: [] })

    calls.push({ method, body: await readBody(request), at: Date.now() })

    return Response.json({
      ok: true,
      result: {
        message_id: calls.length,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 1, type: 'private' },
      },
    })
  },
})

console.log(`fake bot api listening on ${server.port}`)
