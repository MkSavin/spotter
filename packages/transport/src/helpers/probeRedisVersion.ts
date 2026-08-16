type Sender = { send: (command: string, args: string[]) => Promise<unknown> }

/** Redis server version, for the `/status` report. Empty when unavailable. */
export const probeRedisVersion = async (
  sender: Sender,
): Promise<Record<string, string>> => {
  try {
    const info = String(await sender.send('INFO', ['server']))
    const version = info.match(/redis_version:(\S+)/)?.[1]
    return version ? { redis: version } : {}
  } catch {
    return {}
  }
}
