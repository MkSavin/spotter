import type { z } from 'zod'

export const json = (data: unknown, init?: ResponseInit): Response =>
  Response.json(data, init)

export const badRequest = (message: string): Response =>
  Response.json({ error: message }, { status: 400 })

export const notFound = (message = 'not found'): Response =>
  Response.json({ error: message }, { status: 404 })

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response }

/** Parses a JSON request body against a schema, or yields a 400 response. */
export const parseBody = async <T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> => {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: badRequest('invalid JSON body') }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    return { ok: false, response: badRequest('invalid request body') }
  }
  return { ok: true, data: result.data }
}
