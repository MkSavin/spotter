// Dead-letter inspection and replay: what the regulator gave up on after
// `REDIS_MAX_DELIVERIES` attempts, and how to put it back once the cause is
// fixed. An outage longer than the retry budget (5 tries, 5 minutes apart)
// lands every event here rather than losing it.

import { $ } from 'bun'

const root = new URL('..', import.meta.url).pathname

type Entry = { id: string; value: string; stream: string; reason: string }

/**
 * The Redis this node keeps its streams in. Named `redis` on a single or cloud
 * node and `local-redis` on ingest, which has no cluster Redis of its own —
 * probing both beats guessing from the mode and silently reading nothing.
 */
const redisService = async (composeArgs: string[]): Promise<string | null> => {
  for (const service of ['redis', 'local-redis']) {
    const result =
      await $`docker ${composeArgs} exec -T ${service} redis-cli PING`
        .cwd(root)
        .quiet()
        .nothrow()
    if (result.stdout.toString().includes('PONG')) return service
  }
  return null
}

const redis = async (
  composeArgs: string[],
  service: string,
  args: string[],
): Promise<string> => {
  const result =
    await $`docker ${composeArgs} exec -T ${service} redis-cli ${args}`
      .cwd(root)
      .quiet()
      .nothrow()
  return result.stdout.toString().trim()
}

/** Every `*.dead` stream Redis currently holds. */
const deadStreams = async (
  composeArgs: string[],
  service: string,
): Promise<string[]> => {
  const keys = await redis(composeArgs, service, ['KEYS', '*.dead'])
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
  service: string,
  stream: string,
): Promise<Entry[]> => {
  const raw = await redis(composeArgs, service, ['XRANGE', stream, '-', '+'])
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

/**
 * Entries a consumer took and never acked, per stream.
 *
 * These are not lost and not yet given up on: the reaper keeps re-dispatching
 * them until they succeed or burn their delivery budget. Reported alongside the
 * dead ones because an outage shorter than that budget leaves everything here
 * and the dead-letter streams empty.
 */
const pending = async (
  composeArgs: string[],
  service: string,
): Promise<Array<{ stream: string; count: number }>> => {
  const keys = await redis(composeArgs, service, ['KEYS', 'spotter.*'])
  const streams = keys
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith('.dead'))

  const found: Array<{ stream: string; count: number }> = []
  for (const stream of streams) {
    const groups = await redis(composeArgs, service, [
      'XINFO',
      'GROUPS',
      stream,
    ])
    // `pending` is printed on the line after its label, per group.
    const lines = groups.split('\n').map((line) => line.trim())
    let total = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'pending') total += Number(lines[i + 1] ?? 0)
    }
    if (total > 0) found.push({ stream, count: total })
  }
  return found
}

export const inspect = async (composeArgs: string[]): Promise<boolean> => {
  const service = await redisService(composeArgs)
  if (!service) {
    console.error('\n  Redis недоступен — запущен ли узел?\n')
    return false
  }

  const streams = await deadStreams(composeArgs, service)
  const stuck = await pending(composeArgs, service)

  if (streams.length === 0) {
    console.log('\n  Отброшенных записей нет.')
    if (stuck.length > 0) {
      console.log('\n  Но есть незавершённые — их ещё переспрашивают:')
      for (const { stream, count } of stuck) {
        console.log(`    ${stream} — ${count}`)
      }
      console.log('')
    } else {
      console.log('  Незавершённых тоже нет — очереди пусты.\n')
    }
    return true
  }

  console.log('')
  for (const stream of streams) {
    const entries = await readEntries(composeArgs, service, stream)
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
  const service = await redisService(composeArgs)
  if (!service) {
    console.error('\n  Redis недоступен — запущен ли узел?\n')
    return false
  }

  const streams = await deadStreams(composeArgs, service)
  if (streams.length === 0) {
    console.log('\n  Возвращать нечего.\n')
    return true
  }

  console.log('')
  let total = 0

  for (const stream of streams) {
    const entries = await readEntries(composeArgs, service, stream)
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
