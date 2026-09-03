import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { $ } from 'bun'

/**
 * The hop nothing else covers: a real Frigate produces an event and publishes
 * it to a real broker.
 *
 * `test_delivery` and `test_media` seed `spotter.event.test_seed` directly, so
 * the NVR, the topics and the payload shape are all our own assumption. In
 * September 2026 that assumption held while the hop itself was down for two
 * days, and nothing said a word.
 *
 * Here only the detector is ours: Frigate does the tracking, the recording,
 * the severity and the publishing. Run it with `bun run test:nvr` — it pulls a
 * ~500MB image and is far too slow for `bun test`.
 */
const COMPOSE = ['-f', `${import.meta.dir}/nvr/nvr.yml`]
const compose = (...args: string[]) => $`docker compose ${COMPOSE} ${args}`

const READY_TIMEOUT_MS = 300_000

const dockerUp = async (): Promise<boolean> =>
  (await $`docker info`.quiet().nothrow()).exitCode === 0

const imagePresent = async (): Promise<boolean> =>
  (await $`docker image inspect ghcr.io/blakeblackshear/frigate:0.17.2`
    .quiet()
    .nothrow()).exitCode === 0

const sourcePresent = async (): Promise<boolean> =>
  await Bun.file(`${import.meta.dir}/nvr/media/source.mp4`).exists()

const usable =
  (await dockerUp()) && (await imagePresent()) && (await sourcePresent())

if (!usable) {
  console.warn(
    'nvr: skipped — needs docker, the pinned frigate image and .e2e/nvr/source.sh',
  )
}

const describeIfReady = usable ? describe : describe.skip

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

const logsOf = async (service: string): Promise<string> => {
  const result = await compose('logs', '--no-color', service).quiet().nothrow()
  return result.stdout.toString() + result.stderr.toString()
}

/** Asks the probe what Frigate has been doing, straight from the container. */
const probeHealth = async (): Promise<{
  framesLeft: number
  framesServed: number
}> => {
  const response = await fetch('http://localhost:8081/health')
  return (await response.json()) as { framesLeft: number; framesServed: number }
}

const detect = async (body: Record<string, unknown>): Promise<Response> =>
  await fetch('http://localhost:8081/detect', {
    method: 'POST',
    body: JSON.stringify(body),
  })

/**
 * Collects `frigate/events` off the broker for a while.
 *
 * Subscribing from outside the compose network is the point: it reads what
 * Frigate actually put on the wire, not what our adapter made of it.
 */
const collectEvents = async (seconds: number): Promise<string> => {
  const result = await $`docker compose ${COMPOSE} exec -T mosquitto \
    mosquitto_sub -t frigate/events -W ${seconds}`
    .quiet()
    .nothrow()
  return result.stdout.toString()
}

describeIfReady('nvr rig: Frigate produces the event itself', () => {
  beforeAll(async () => {
    await compose('down', '-v', '--remove-orphans').quiet().nothrow()

    const up = await compose('up', '-d', '--wait').quiet().nothrow()
    if (up.exitCode !== 0) {
      throw new Error(
        `compose up failed (${up.exitCode}):\n${up.stderr.toString()}\n${up.stdout.toString()}`,
      )
    }
  }, READY_TIMEOUT_MS)

  afterAll(async () => {
    await compose('down', '-v', '--remove-orphans').quiet().nothrow()
  }, 120_000)

  test('Frigate connects to the broker', async () => {
    // The exact failure production had: the adapter was fine, the NVR never
    // reached the broker, and no log line anywhere said so.
    await until(
      async () => (await logsOf('frigate')).toLowerCase().includes('mqtt'),
      'frigate mqtt connect',
      120_000,
    )

    expect((await logsOf('frigate')).toLowerCase()).toContain('mqtt')
  }, 150_000)

  test('Frigate polls the probe for detections', async () => {
    // Proves the NVR is running inference against us, not merely connected.
    await until(
      async () => (await probeHealth()).framesServed > 0,
      'frigate to poll the detector',
      120_000,
    )

    expect((await probeHealth()).framesServed).toBeGreaterThan(0)
  }, 150_000)

  test('an armed detection reaches the broker as a real event', async () => {
    const armed = await detect({ class_id: 0, score: 0.9, frames: 60 })
    expect(armed.status).toBe(200)

    const published = await collectEvents(45)

    // Frigate's own payload, off the wire — the shape our adapter parses.
    expect(published).toContain('"camera"')
    expect(published).toContain('person')
  }, 180_000)
})
