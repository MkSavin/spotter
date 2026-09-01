import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { $ } from 'bun'

/**
 * Compose-level smoke: the published images, the real wiring, nothing stubbed
 * except the NVR.
 *
 * This is the only level that sees a broken Dockerfile, a missing env var or a
 * healthcheck that never goes green — the in-process suite composes controllers
 * and never starts a container. It is correspondingly slow, so it is not part
 * of `bun test`; run it with `bun run test:smoke`.
 */
const READY_TIMEOUT_MS = 240_000

const composeFile = (shape: 'single' | 'split') => [
  '-f',
  `${import.meta.dir}/smoke/smoke.${shape}.yml`,
]

const dockerUp = async (): Promise<boolean> =>
  (await $`docker info`.quiet().nothrow()).exitCode === 0

const imagesBuilt = async (): Promise<boolean> => {
  const probe = await $`docker image inspect spotter-smoke/server:test`
    .quiet()
    .nothrow()
  return probe.exitCode === 0
}

const usable = (await dockerUp()) && (await imagesBuilt())

if (!usable) {
  console.warn(
    'smoke: skipped — needs docker and `bun run smoke:build` beforehand',
  )
}

const describeIfReady = usable ? describe : describe.skip

/** Health of one service, as compose itself reports it. */
const healthOf = async (
  COMPOSE: string[],
  service: string,
): Promise<string> => {
  const result = await $`docker compose ${COMPOSE} ps --format json ${service}`
    .quiet()
    .nothrow()

  const line = result.stdout.toString().trim().split('\n').filter(Boolean)[0]
  if (!line) return 'missing'

  try {
    const parsed = JSON.parse(line) as { Health?: string; State?: string }
    return parsed.Health || parsed.State || 'unknown'
  } catch {
    return 'unparseable'
  }
}

const until = async (
  check: () => Promise<boolean>,
  what: string,
  timeoutMs = 60_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await Bun.sleep(1_000)
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Compose writes service logs to stderr, so both streams have to be read. */
const logsOf = async (COMPOSE: string[], service: string): Promise<string> => {
  const result = await $`docker compose ${COMPOSE} logs --no-color ${service}`
    .quiet()
    .nothrow()
  return result.stdout.toString() + result.stderr.toString()
}

const SERVICES: Record<'single' | 'split', string[]> = {
  single: ['spotter-frigate', 'spotter-depot', 'spotter-server'],
  split: [
    'spotter-frigate',
    'spotter-depot',
    'spotter-forwarder',
    'spotter-server',
  ],
}

// Both shapes, same expectations. The split one is where a stream missing from
// the forwarder's map shows up — on one node everything shares a Redis and the
// gap is invisible.
for (const shape of ['single', 'split'] as const) {
  const COMPOSE = composeFile(shape)
  const compose = (...args: string[]) => $`docker compose ${COMPOSE} ${args}`

  describeIfReady(`smoke: ${shape} deployment`, () => {
    beforeAll(async () => {
      await compose('down', '-v', '--remove-orphans').quiet().nothrow()

      // `.quiet()` is what routes output into the buffer; without it the text
      // goes to the terminal and a failure here reports nothing useful.
      const up = await compose('up', '-d', '--wait').quiet().nothrow()

      if (up.exitCode !== 0) {
        throw new Error(
          `compose up failed (${up.exitCode}):\n${up.stderr.toString()}\n${up.stdout.toString()}`,
        )
      }
    }, READY_TIMEOUT_MS)

    afterAll(async () => {
      await compose('down', '-v', '--remove-orphans').quiet().nothrow()
    }, 60_000)

    // Each service reports healthy only while Redis actually answers it, so
    // this is a statement about the whole stack, not that a process started.
    for (const service of SERVICES[shape]) {
      test(
        `${service} becomes healthy`,
        async () => {
          await until(
            async () => (await healthOf(COMPOSE, service)) === 'healthy',
            `${service} health`,
            150_000,
          )

          expect(await healthOf(COMPOSE, service)).toBe('healthy')
        },
        180_000,
      )
    }

    test('no service crash-loops on startup', async () => {
      const result = await compose('ps', '-a', '--format', 'json')
        .quiet()
        .nothrow()

      const rows = result.stdout
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { Service: string; State: string })

      const broken = rows.filter(
        (row) => row.Service.startsWith('spotter-') && row.State !== 'running',
      )

      expect(broken.map((row) => `${row.Service}:${row.State}`)).toEqual([])
    }, 30_000)

    test('the adapter reaches the NVR and publishes its catalog', async () => {
      // Proves the image can talk to a dependency by container name — the
      // class of failure no unit test can have.
      await until(
        async () =>
          (await logsOf(COMPOSE, 'spotter-frigate')).includes('Published catalog'),
        'catalog publish',
        90_000,
      )

      expect(await logsOf(COMPOSE, 'spotter-frigate')).toContain(
        'Published catalog',
      )
    }, 120_000)

    test('the catalog reaches the domain', async () => {
      // On the split shape this only holds if the forwarder actually carries
      // the catalog stream across; on one node it is a weaker check.
      await until(
        async () =>
          (await logsOf(COMPOSE, 'spotter-server')).includes('Catalog cached'),
        'catalog on the server',
        90_000,
      )

      expect(await logsOf(COMPOSE, 'spotter-server')).toContain(
        'Catalog cached',
      )
    }, 120_000)

    test('migrations run and the server comes up clean', async () => {
      const logs = await logsOf(COMPOSE, 'spotter-server')

      expect(logs).toContain('spotter-server is running')
      // A missing drizzle/ directory in the image shows up exactly here.
      expect(logs).not.toContain('no such table')
    }, 30_000)
  })
}
