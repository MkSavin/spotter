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

/**
 * Updates queued for the bot to collect, so a test can put words in a user's
 * mouth — the only way to exercise `/login`, which needs a real message from a
 * real chat before a recipient exists at all.
 */
const updates: unknown[] = []
let updateId = 1

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
      updates.length = 0
      return Response.json({ ok: true })
    }

    // Queue a message as if a person had typed it.
    if (pathname === '/__send' && request.method === 'POST') {
      const body = (await request.json()) as {
        text: string
        chatId?: number
        userId?: number
        username?: string
      }
      const chatId = body.chatId ?? 1000
      const userId = body.userId ?? 2000

      updates.push({
        update_id: updateId++,
        message: {
          message_id: updateId,
          date: Math.floor(Date.now() / 1000),
          text: body.text,
          from: {
            id: userId,
            is_bot: false,
            first_name: 'Rig',
            username: body.username ?? 'rig_user',
          },
          chat: { id: chatId, type: 'private', username: body.username },
          entities: body.text.startsWith('/')
            ? [{ type: 'bot_command', offset: 0, length: body.text.split(' ')[0].length }]
            : [],
        },
      })

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

    // Long polling: hand over anything queued, then go quiet again rather than
    // hanging, so the bot idles cheaply between tests.
    if (method === 'getUpdates') {
      const pending = updates.splice(0, updates.length)
      return Response.json({ ok: true, result: pending })
    }

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
