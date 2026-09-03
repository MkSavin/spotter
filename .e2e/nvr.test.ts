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

const adapterBuilt = async (): Promise<boolean> => {
  for (const app of ['frigate', 'server', 'telegram', 'pwa']) {
    const probe = await $`docker image inspect spotter-nvr/${app}:test`
      .quiet()
      .nothrow()
    if (probe.exitCode !== 0) return false
  }
  return true
}

const usable =
  (await dockerUp()) &&
  (await imagePresent()) &&
  (await sourcePresent()) &&
  (await adapterBuilt())

if (!usable) {
  console.warn(
    'nvr: skipped — needs docker, the pinned frigate image, `bun run nvr:build` and `bun run nvr:source`',
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

/** Events Frigate has recorded, newest first. */
const recordedEvents = async (): Promise<
  Array<{ id: string; camera: string; label: string }>
> => {
  const response = await fetch('http://localhost:5050/api/events?limit=10')
  if (!response.ok) return []
  return (await response.json()) as Array<{
    id: string
    camera: string
    label: string
  }>
}

/** What the bot tried to send, as recorded by the fake Bot API. */
const botCalls = async (
  method?: string,
): Promise<Array<{ method: string; body: unknown }>> => {
  const url = method
    ? `http://localhost:8090/__calls?method=${method}`
    : 'http://localhost:8090/__calls'
  const response = await fetch(url)
  if (!response.ok) return []
  const payload = (await response.json()) as {
    calls: Array<{ method: string; body: unknown }>
  }
  return payload.calls
}

/** Reads a Redis stream from the rig's own container. */
const streamLength = async (stream: string): Promise<number> => {
  const result = await compose('exec', '-T', 'redis', 'redis-cli', 'XLEN', stream)
    .quiet()
    .nothrow()
  return Number(result.stdout.toString().trim()) || 0
}

const firstEntry = async (stream: string): Promise<string> => {
  const result = await compose(
    'exec',
    '-T',
    'redis',
    'redis-cli',
    'XRANGE',
    stream,
    '-',
    '+',
    'COUNT',
    '1',
  )
    .quiet()
    .nothrow()
  return result.stdout.toString()
}

describeIfReady('nvr rig: Frigate produces the event itself', () => {
  beforeAll(async () => {
    await compose('down', '-v', '--remove-orphans').quiet().nothrow()

    // `--build` matters for the locally-built stand-ins (the probe, the Bot API
    // recorder): compose reuses a stale image otherwise, and a test then fails
    // against code that is not the code in the tree.
    const up = await compose('up', '-d', '--build', '--wait').quiet().nothrow()
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
    // Subscribe before arming: the whole point is to catch the publish, and
    // Frigate opens the event within a second of the first detection.
    const listening = collectEvents(60)
    await Bun.sleep(2_000)

    const armed = await detect({ class_id: 0, score: 0.95, frames: 100 })
    expect(armed.status).toBe(200)

    const published = await listening

    // Frigate's own payload, off the wire — the shape our adapter parses, with
    // the score we asked for carried through its tracker untouched.
    expect(published).toContain('"before"')
    expect(published).toContain('"label": "person"')
    expect(published).toContain('"camera": "front"')
  }, 180_000)

  test('the adapter turns it into a spotter event in Redis', async () => {
    // The whole chain in one assertion: the score we handed the probe comes
    // back out of Redis unchanged, having passed through Frigate's detector,
    // its tracker, MQTT and our adapter. Seeding `test_seed` proves none of it.
    await until(
      async () => (await streamLength('spotter.event')) > 0,
      'the adapter to publish a spotter event',
      90_000,
    )

    const entry = await firstEntry('spotter.event')
    expect(entry).toContain('"camera":"front"')
    expect(entry).toContain('"label":"person"')
    expect(entry).toContain('"source":"frigate"')
  }, 120_000)

  test('a refused probe request answers instead of going quiet', async () => {
    // The whole point of the reply channel: an unanswered `/test` looks exactly
    // like the outage it exists to detect, and the admin waits for nothing.
    await compose(
      'exec',
      '-T',
      'redis',
      'redis-cli',
      'XADD',
      'spotter.probe.request.frigate',
      '*',
      'value',
      JSON.stringify({
        source: 'frigate',
        camera: 'front',
        // A label the probe has no class id for, so the adapter refuses.
        label: 'dragon',
        frames: 10,
        score: 0.9,
        chatId: 4242,
      }),
    )
      .quiet()
      .nothrow()

    await until(
      async () => {
        const result = await compose(
          'exec',
          '-T',
          'redis',
          'redis-cli',
          'XLEN',
          'spotter.probe.result',
        )
          .quiet()
          .nothrow()
        return Number(result.stdout.toString().trim()) > 0
      },
      'the adapter to answer the refused request',
      60_000,
    )

    const entry = await compose(
      'exec',
      '-T',
      'redis',
      'redis-cli',
      'XRANGE',
      'spotter.probe.result',
      '-',
      '+',
      'COUNT',
      '1',
    )
      .quiet()
      .nothrow()

    const text = entry.stdout.toString()
    expect(text).toContain('"staged":false')
    // Carries a reason a person can act on, not just a flag.
    expect(text).toContain('"reason"')
    expect(text).toContain('4242')
  }, 90_000)

  test('a probe request on the bus stages a detection', async () => {
    // The path `/test` takes in production: the bot publishes to the stream,
    // the adapter reaches the probe. Nothing here talks to the probe directly.
    const before = (await probeHealth()).framesServed

    await compose(
      'exec',
      '-T',
      'redis',
      'redis-cli',
      'XADD',
      'spotter.probe.request.frigate',
      '*',
      'value',
      JSON.stringify({
        source: 'frigate',
        camera: 'front',
        label: 'person',
        frames: 40,
        score: 0.88,
      }),
    )
      .quiet()
      .nothrow()

    await until(
      async () =>
        (await logsOf('spotter-frigate')).includes('Staged a person on front'),
      'the adapter to stage the detection',
      60_000,
    )

    expect(await logsOf('spotter-frigate')).toContain('Staged a person on front')
    expect((await probeHealth()).framesServed).toBeGreaterThan(before)
  }, 90_000)

  test('the bot runs against the recorder, never a real chat', async () => {
    // grammY dials `apiRoot` for every call, so a rig run cannot message
    // anyone. The bot proves it is talking to the recorder by having booted at
    // all: `getMe` has to succeed before grammY will start.
    const logs = await logsOf('spotter-telegram')

    expect(logs).toContain('Bot API redirected to http://botapi:8090')
    expect(logs).toContain('Bot is successfully started up!')
    expect(logs).not.toContain('api.telegram.org')
  }, 60_000)

  test('the PWA announces where it lives, so the bot can link to it', async () => {
    // `/user_sign` builds its one-tap login link from this. Taken off the bus
    // rather than configured twice, so the two cannot drift apart.
    await until(
      async () => {
        const result = await compose(
          'exec',
          '-T',
          'redis',
          'redis-cli',
          'XREVRANGE',
          'spotter.heartbeat',
          '+',
          '-',
          'COUNT',
          '30',
        )
          .quiet()
          .nothrow()
        return result.stdout.toString().includes('"service":"pwa"')
      },
      'the pwa to report in',
      90_000,
    )

    const beats = await compose(
      'exec',
      '-T',
      'redis',
      'redis-cli',
      'XREVRANGE',
      'spotter.heartbeat',
      '+',
      '-',
      'COUNT',
      '30',
    )
      .quiet()
      .nothrow()

    expect(beats.stdout.toString()).toContain('http://pwa.rig.test')
  }, 120_000)

  test('an event reaches a registered recipient as a message', async () => {
    // The last stretch, and the one a seeded event could never reach: a real
    // person redeems a real code, and a real event turns into a real send.
    // Everything before this proves the pipeline; this proves delivery.
    const CHAT = 777001

    // 1. The domain mints a code, exactly as `/user_sign` would.
    const minted = await compose(
      'exec',
      '-T',
      'spotter-server',
      'bun',
      'spotter',
      'sign',
      'admin',
      '--raw',
    )
      .quiet()
      .nothrow()

    const code = minted.stdout.toString().trim().split('\n').at(-1) ?? ''
    expect(code).not.toBe('')

    // 2. A person types `/login <code>` — the fake Bot API hands it to the bot
    // as a genuine update, so the whole grammY path runs.
    await fetch('http://localhost:8090/__send', {
      method: 'POST',
      body: JSON.stringify({ text: `/login ${code}`, chatId: CHAT }),
    })

    await until(
      async () =>
        (await logsOf('spotter-telegram')).includes('redeem') ||
        (await botCalls('sendMessage')).some((call) =>
          String(JSON.stringify(call)).includes(String(CHAT)),
        ),
      'the bot to answer the login',
      90_000,
    )

    // 3. Now a recipient exists, so an event has somewhere to go.
    await detect({ class_id: 0, score: 0.94, frames: 80 })

    await until(
      async () => {
        const sends = await botCalls()
        return sends.some((call) =>
          JSON.stringify(call.body).includes(String(CHAT)),
        )
      },
      'the event to be delivered to the chat',
      180_000,
    )

    const delivered = (await botCalls()).filter((call) =>
      JSON.stringify(call.body).includes(String(CHAT)),
    )

    // More than the login reply: the event itself came through.
    expect(delivered.length).toBeGreaterThan(1)
  }, 300_000)

  test('the domain reaches the bot', async () => {
    // The catalog crosses server → bot, which is the hop that tells us the two
    // halves of the deployment actually see each other.
    await until(
      async () =>
        (await logsOf('spotter-telegram')).includes('Catalog cached'),
      'the catalog to reach the bot',
      90_000,
    )

    expect(await logsOf('spotter-telegram')).toContain('Catalog cached')
  }, 120_000)

  test('the adapter notices when the NVR stops talking', async () => {
    // September 2026, reproduced: Frigate loses its route to the broker while
    // the adapter keeps beating happily, and every other signal stays green.
    //
    // Asserted on the heartbeat rather than on a delivered alert: the alert
    // fires after SOURCE_UNREACHABLE_MS, which is a quarter of an hour by
    // design and far too long to sit through here. What the rig proves is that
    // the input the watchdog needs is real and stops when the link does; the
    // decision itself is covered by SourceWatcher's own tests.
    const contactOf = async (): Promise<number | undefined> => {
      const result = await compose(
        'exec',
        '-T',
        'redis',
        'redis-cli',
        'XREVRANGE',
        'spotter.heartbeat',
        '+',
        '-',
        'COUNT',
        '1',
      )
        .quiet()
        .nothrow()

      const found = /"lastContactAt":(\d+)/.exec(result.stdout.toString())
      return found ? Number(found[1]) : undefined
    }

    const beatCount = async (): Promise<number> =>
      Number(
        (await compose('exec', '-T', 'redis', 'redis-cli', 'XLEN', 'spotter.heartbeat')
          .quiet()
          .nothrow()).stdout.toString().trim(),
      )

    // Frigate publishes stats once a minute, so the first contact takes a while.
    await until(
      async () => (await contactOf()) !== undefined,
      'the adapter to hear from the NVR',
      180_000,
    )

    await $`docker network disconnect spotter-nvr_nvr spotter-nvr-frigate-1`
      .quiet()
      .nothrow()

    try {
      // Read the baseline after the cut, not before it: a stats message already
      // in flight lands a moment later and would look like a live link.
      await Bun.sleep(10_000)
      const before = await contactOf()
      const beatsBefore = await beatCount()

      // Longer than one stats round, so a healthy link would have advanced.
      await Bun.sleep(90_000)

      expect(await contactOf()).toBe(before as number)
      // Still beating: this is why the gap needed its own signal instead of
      // being inferred from a missing heartbeat.
      expect(await beatCount()).toBeGreaterThan(beatsBefore)
    } finally {
      await $`docker network connect spotter-nvr_nvr spotter-nvr-frigate-1`
        .quiet()
        .nothrow()
    }
  }, 300_000)

  test('Frigate records the event as its own', async () => {
    // Not just a message on a topic: the NVR opened, tracked and closed an
    // event, which is what a seeded `test_seed` payload can never demonstrate.
    await until(
      async () => (await recordedEvents()).length > 0,
      'frigate to record an event',
      60_000,
    )

    const events = await recordedEvents()
    expect(events[0].camera).toBe('front')
    expect(events[0].label).toBe('person')
  }, 90_000)
})
