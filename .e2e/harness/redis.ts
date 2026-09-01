import { $ } from 'bun'

/**
 * A throwaway Redis in Docker.
 *
 * Real, not a fake: the behaviour these tests exist to catch — consumer groups
 * vanishing, entries staying pending, a client that never recovers — lives in
 * Redis semantics, and an in-memory stand-in would reproduce the parts we
 * already believe and none of the parts that break.
 */
export type RedisHandle = {
  url: string
  name: string
  /** Stops the container; the service is expected to survive and reconnect. */
  kill: () => Promise<void>
  /** Starts it again on the same port, empty unless it kept its data. */
  revive: () => Promise<void>
  stop: () => Promise<void>
  /** `FLUSHALL`, so one test does not inherit another's streams. */
  flush: () => Promise<void>
}

const wait = async (port: number, attempts = 60): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const probe =
      await $`docker exec spotter-e2e-${port} redis-cli PING`.quiet().nothrow()
    if (probe.stdout.toString().includes('PONG')) return
    await Bun.sleep(250)
  }
  throw new Error(`redis on ${port} never became ready`)
}

export const startRedis = async (port: number): Promise<RedisHandle> => {
  const name = `spotter-e2e-${port}`

  await $`docker rm -f ${name}`.quiet().nothrow()
  await $`docker run -d --rm --name ${name} -p ${port}:6379 redis:7-alpine`
    .quiet()
    .nothrow()

  await wait(port)

  return {
    url: `redis://127.0.0.1:${port}`,
    name,
    kill: async () => {
      await $`docker rm -f ${name}`.quiet().nothrow()
    },
    revive: async () => {
      await $`docker run -d --rm --name ${name} -p ${port}:6379 redis:7-alpine`
        .quiet()
        .nothrow()
      await wait(port)
    },
    stop: async () => {
      await $`docker rm -f ${name}`.quiet().nothrow()
    },
    flush: async () => {
      await $`docker exec ${name} redis-cli FLUSHALL`.quiet().nothrow()
    },
  }
}

/** Whether Docker is usable; the suite skips itself rather than failing. */
export const dockerAvailable = async (): Promise<boolean> => {
  const probe = await $`docker info`.quiet().nothrow()
  return probe.exitCode === 0
}
