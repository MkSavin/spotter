import type { QueueDepth } from '../schema/heartbeat'

type Sender = {
  send: (command: string, args: string[]) => Promise<unknown>
}

/** `XINFO GROUPS` reply row, as far as we care about it. */
type GroupInfo = { name?: unknown; lag?: unknown; pending?: unknown }

/** Redis returns `lag: null` when it cannot compute one; treat that as unknown. */
const asCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

/**
 * Stream entry ids lead with the epoch ms they were added, which is the only
 * clock available here — `XPENDING` reports no timestamps of its own.
 */
export const entryAgeMs = (
  id: unknown,
  now = Date.now(),
): number | undefined => {
  if (typeof id !== 'string') return undefined
  const millis = Number(id.split('-')[0])
  if (!Number.isFinite(millis)) return undefined
  return Math.max(0, now - millis)
}

/**
 * Reads how much work one group has outstanding on one stream.
 *
 * Returns `null` when the stream or group does not exist yet — a service that
 * has never received anything is not a failure to report, and on a fresh
 * install that is every stream.
 */
export const readQueueDepth = async (
  client: Sender,
  stream: string,
  group: string,
): Promise<QueueDepth | null> => {
  let groups: unknown
  try {
    groups = await client.send('XINFO', ['GROUPS', stream])
  } catch {
    // `ERR no such key` on a stream nobody has written to yet.
    return null
  }

  if (!Array.isArray(groups)) return null

  const info = groups.find(
    (entry): entry is GroupInfo =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as GroupInfo).name === group,
  )
  if (!info) return null

  const depth: QueueDepth = {
    stream,
    lag: asCount(info.lag),
    pending: asCount(info.pending),
  }

  if (depth.pending === 0) return depth

  // The oldest unacked entry tells a transient burst from a stuck handler.
  try {
    const summary = await client.send('XPENDING', [stream, group])
    if (Array.isArray(summary)) {
      const age = entryAgeMs(summary[1])
      if (age !== undefined) depth.oldestPendingMs = age
    }
  } catch {
    // Age is a nice-to-have; the counts above are the point.
  }

  return depth
}

/**
 * Depth of every stream a service consumes, skipping the quiet ones.
 *
 * Empty queues are the normal state, and reporting a row of zeroes on every
 * beat would bury the one number that matters when something is wrong.
 */
export const readQueueDepths = async (
  client: Sender,
  streams: string[],
  group: string,
): Promise<QueueDepth[]> => {
  const depths = await Promise.all(
    streams.map((stream) =>
      readQueueDepth(client, stream, group).catch(() => null),
    ),
  )

  return depths.filter(
    (depth): depth is QueueDepth =>
      depth !== null && (depth.lag > 0 || depth.pending > 0),
  )
}
