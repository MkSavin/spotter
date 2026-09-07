// Dead-letter inspection and replay: what the regulator gave up on after
// `REDIS_MAX_DELIVERIES` attempts, and how to put it back once the cause is
// fixed. An outage longer than the retry budget (5 tries, 5 minutes apart)
// lands every event here rather than losing it.

import { $ } from 'bun'

const root = new URL('..', import.meta.url).pathname

type Entry = { id: string; value: string; stream: string; reason: string }

const redis = async (
  composeArgs: string[],
  args: string[],
): Promise<string> => {
  const result = await $`docker ${composeArgs} exec -T redis redis-cli ${args}`
    .cwd(root)
    .quiet()
    .nothrow()
  return result.stdout.toString().trim()
}

/** Every `*.dead` stream Redis currently holds. */
const deadStreams = async (composeArgs: string[]): Promise<string[]> => {
  const keys = await redis(composeArgs, ['KEYS', '*.dead'])
  return keys
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * `XRANGE` prints one value per line, so entries are reassembled by walking the
 * flat output: an id line opens an entry and the field/value pairs follow.
 */
const readEntries = async (
  composeArgs: string[],
  stream: string,
): Promise<Entry[]> => {
  const raw = await redis(composeArgs, ['XRANGE', stream, '-', '+'])
  if (!raw) return []

  const lines = raw.split('\n').map((line) => line.trim())
  const entries: Entry[] = []
  let current: Partial<Entry> & { fields: Record<string, string> } = {
    fields: {},
  }

  const flush = () => {
    if (!current.id) return
    entries.push({
      id: current.id,
      value: current.fields.value ?? '',
      stream: current.fields.stream ?? '',
      reason: current.fields.reason ?? '',
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // Redis stream ids are `<millis>-<seq>` and nothing else looks like one.
    if (/^\d+-\d+$/.test(line)) {
      flush()
      current = { id: line, fields: {} }
      continue
    }
    if (!current.id) continue
    const key = line
    const value = lines[++i] ?? ''
    current.fields[key] = value
  }
  flush()

  return entries
}

const describe = (entry: Entry): string => {
  const eventId = entry.value.match(/"eventId"\s*:\s*"([^"]+)"/)?.[1]
  return `${entry.id}  ${eventId ?? entry.value.slice(0, 48)}`
}

export const inspect = async (composeArgs: string[]): Promise<boolean> => {
  const streams = await deadStreams(composeArgs)
  if (streams.length === 0) {
    console.log('\n  Отброшенных записей нет.\n')
    return true
  }

  console.log('')
  for (const stream of streams) {
    const entries = await readEntries(composeArgs, stream)
    console.log(`  ${stream} — ${entries.length}`)
    for (const entry of entries.slice(0, 10)) {
      console.log(`    ${describe(entry)}`)
    }
    if (entries.length > 10) {
      console.log(`    … ещё ${entries.length - 10}`)
    }
  }
  console.log('\n  Вернуть в обработку: ./spotter dlq --replay\n')
  return true
}

/**
 * Puts each entry back on the stream it came from and clears the dead-letter
 * one. Republished rather than moved: the original id is long acked, and the
 * consumer group only ever sees new entries.
 */
export const replay = async (composeArgs: string[]): Promise<boolean> => {
  const streams = await deadStreams(composeArgs)
  if (streams.length === 0) {
    console.log('\n  Возвращать нечего.\n')
    return true
  }

  console.log('')
  let total = 0

  for (const stream of streams) {
    const entries = await readEntries(composeArgs, stream)
    let restored = 0

    for (const entry of entries) {
      // Without the origin there is nowhere to put it back; leave it for a look.
      if (!entry.stream || !entry.value) continue
      await redis(composeArgs, [
        'XADD',
        entry.stream,
        '*',
        'value',
        entry.value,
      ])
      await redis(composeArgs, ['XDEL', stream, entry.id])
      restored++
    }

    total += restored
    const stuck = entries.length - restored
    console.log(
      `  ${stream} → ${restored}${stuck > 0 ? ` (${stuck} без адреса, оставлено)` : ''}`,
    )
  }

  console.log(`\n  Возвращено записей: ${total}\n`)
  return true
}
