// Redis stream replies arrive in different shapes depending on the protocol
// Bun's RedisClient negotiates. XREADGROUP under RESP2 is an array of
// `[stream, entries]` pairs; under RESP3 it is a map `{ stream: entries }`
// (surfaced as a plain object or a JS Map). XAUTOCLAIM is always
// `[cursor, entries, deletedIds]`. Each entry is `[id, [field, value, ...]]`.
// These helpers normalize all of that into a flat, predictable list so the
// regulator never has to branch on protocol details.

export type StreamMessage = {
  id: string
  value: string
}

export type StreamRecord = {
  topic: string
  message: StreamMessage
}

// `[field, value, field, value, ...]` → the value stored under `value`.
const readValueField = (fields: unknown): string => {
  if (!Array.isArray(fields)) {
    return ''
  }

  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (fields[index] === 'value') {
      return String(fields[index + 1] ?? '')
    }
  }

  return ''
}

// `[[id, [field, value, ...]], ...]` for a single stream. Shared by XREADGROUP,
// XCLAIM and XRANGE replies, which all use this entry shape.
export const parseEntries = (
  topic: string,
  entries: unknown,
): StreamRecord[] => {
  if (!Array.isArray(entries)) {
    return []
  }

  const records: StreamRecord[] = []

  for (const entry of entries) {
    if (!Array.isArray(entry)) {
      continue
    }

    const [id, fields] = entry

    if (id == null) {
      continue
    }

    records.push({
      topic,
      message: { id: String(id), value: readValueField(fields) },
    })
  }

  return records
}

// XREADGROUP reply: RESP2 array of `[stream, entries]`, RESP3 object/Map.
export const parseReadGroupReply = (reply: unknown): StreamRecord[] => {
  if (reply == null) {
    return []
  }

  if (reply instanceof Map) {
    return Array.from(reply.entries()).flatMap(([topic, entries]) =>
      parseEntries(String(topic), entries),
    )
  }

  if (Array.isArray(reply)) {
    return reply.flatMap((pair) => {
      if (!Array.isArray(pair)) {
        return []
      }
      const [topic, entries] = pair
      return parseEntries(String(topic), entries)
    })
  }

  if (typeof reply === 'object') {
    return Object.entries(reply as Record<string, unknown>).flatMap(
      ([topic, entries]) => parseEntries(topic, entries),
    )
  }

  return []
}

export type PendingEntry = {
  id: string
  // How many times this entry has been delivered (incremented by XREADGROUP and
  // XCLAIM). Used to detect poison messages that keep failing.
  deliveries: number
}

// Extended XPENDING reply: `[[id, consumer, idleMs, deliveryCount], ...]`.
export const parsePendingReply = (reply: unknown): PendingEntry[] => {
  if (!Array.isArray(reply)) {
    return []
  }

  const entries: PendingEntry[] = []

  for (const item of reply) {
    if (!Array.isArray(item) || item[0] == null) {
      continue
    }
    entries.push({
      id: String(item[0]),
      deliveries: Number(item[3] ?? 0),
    })
  }

  return entries
}
