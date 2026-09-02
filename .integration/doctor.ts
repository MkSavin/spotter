// Self-diagnosis: walks the pipeline in order and reports the first broken
// link, so the failing hop is named instead of guessed from logs.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { $ } from 'bun'

export type Mode = 'single' | 'cloud' | 'ingest'
export type Status = 'ok' | 'warn' | 'fail'

export type Check = {
  name: string
  status: Status
  detail: string
  hint?: string
}

const root = path.join(import.meta.dir, '..')

const readEnv = (): Record<string, string> => {
  const file = path.join(root, '.env')
  if (!existsSync(file)) return {}
  const values: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match?.[1]) values[match[1]] = (match[2] ?? '').replace(/\s+#.*$/, '')
  }
  return values
}

/** Runs a command inside a compose service. */
const inService = async (
  composeArgs: string[],
  service: string,
  command: string,
): Promise<{ ok: boolean; out: string }> => {
  const result =
    await $`docker ${composeArgs} exec -T ${service} sh -c ${command}`
      .cwd(root)
      .quiet()
      .nothrow()
  return {
    ok: result.exitCode === 0,
    out: (result.stdout.toString() + result.stderr.toString()).trim(),
  }
}

const runningServices = async (composeArgs: string[]): Promise<string[]> => {
  const result =
    await $`docker ${composeArgs} ps --services --filter status=running`
      .cwd(root)
      .quiet()
      .nothrow()
  return result.stdout.toString().trim().split('\n').filter(Boolean)
}

const checkContainers = async (
  composeArgs: string[],
  expected: string[],
): Promise<Check[]> => {
  const running = await runningServices(composeArgs)
  return expected.map((service) => ({
    name: `Контейнер ${service}`,
    status: running.includes(service) ? 'ok' : ('fail' as Status),
    detail: running.includes(service) ? 'работает' : 'не запущен',
    hint: running.includes(service) ? undefined : './spotter up',
  }))
}

const checkRedis = async (
  composeArgs: string[],
  service: string,
): Promise<Check[]> => {
  const { ok, out } = await inService(composeArgs, service, 'redis-cli ping')
  const alive = ok && out.includes('PONG')
  const checks: Check[] = [
    {
      name: 'Redis',
      status: alive ? 'ok' : 'fail',
      detail: alive ? 'отвечает' : out || 'нет ответа',
      hint: ok ? undefined : `./spotter logs ${service}`,
    },
  ]

  if (!alive) return checks

  // Without overcommit a background save can fail, losing buffered events.
  const overcommit = (
    await $`sysctl -n vm.overcommit_memory`.quiet().nothrow().text()
  ).trim()
  if (overcommit && overcommit !== '1') {
    checks.push({
      name: 'vm.overcommit_memory',
      status: 'warn',
      detail: `${overcommit} — фоновое сохранение Redis может не пройти`,
      hint: 'sysctl vm.overcommit_memory=1 (и строку в /etc/sysctl.conf, чтобы пережило перезагрузку)',
    })
  }

  return checks
}

/** A broker nobody publishes to looks healthy, so this also listens for events. */
const checkMqtt = async (
  composeArgs: string[],
  broker: string,
  own: boolean,
): Promise<Check[]> => {
  const target = broker.replace(/^mqtts?:\/\//, '')
  const [host = 'mosquitto', port = '1883'] = target.split(':')

  // From the adapter's container — the path it really uses. `nc` may be absent.
  const reach = await inService(
    composeArgs,
    'spotter-frigate',
    `bun -e 'Bun.connect({hostname:"${host}",port:${port},socket:{open(s){console.log("reachable");s.end()}}})` +
      `.catch(()=>console.log("refused"));setTimeout(()=>process.exit(0),5000)'`,
  )

  if (!reach.out.includes('reachable')) {
    return [
      {
        name: 'MQTT-брокер',
        status: 'fail',
        detail: `${host}:${port} недоступен из spotter-frigate`,
        hint: own
          ? 'свой брокер не поднялся — проверь MQTT_BROKER в .env и `./spotter ps`'
          : 'проверь адрес в MQTT_BROKER и что брокер принимает подключения',
      },
    ]
  }

  const checks: Check[] = [
    {
      name: 'MQTT-брокер',
      status: 'ok',
      detail: `${host}:${port} доступен${own ? ' (свой)' : ' (внешний)'}`,
    },
  ]

  // Only our own broker ships the CLI tools needed to listen in.
  if (!own) return checks

  const listen = await inService(
    composeArgs,
    'mosquitto',
    'timeout 12 mosquitto_sub -t "frigate/#" -C 1 -v 2>&1 | head -c 200',
  )

  const heard =
    listen.out.trim().length > 0 && !/error|refused/i.test(listen.out)
  checks.push({
    name: 'События от Frigate',
    status: heard ? 'ok' : 'warn',
    detail: heard
      ? `идут (${listen.out.trim().split(/\s+/)[0]})`
      : 'за 12 секунд ничего не пришло',
    ...(heard
      ? {}
      : {
          hint: 'если в кадре сейчас пусто — это норма; иначе проверь секцию mqtt в config.yml Frigate (host, port, topic_prefix: frigate)',
        }),
  })

  return checks
}

const checkFrigate = async (composeArgs: string[]): Promise<Check[]> => {
  // Parsed inside the container: truncating the JSON here cut `cameras` off and
  // reported a healthy Frigate as broken.
  const script = [
    'const e = process.env;',
    'const r = await fetch(e.FRIGATE_REMOTE_URL + "/api/config",',
    '{headers:{Authorization:"Bearer " + e.FRIGATE_AUTH_SECRET}});',
    'if(!r.ok){console.log("HTTP " + r.status);process.exit(0)}',
    'const c = await r.json();',
    'console.log("OK " + Object.keys(c.cameras ?? {}).length + " " + (c.version ?? "?"))',
  ].join('')

  const probe = await inService(
    composeArgs,
    'spotter-frigate',
    `bun -e '${script}' 2>&1 | tail -c 200`,
  )

  const parsed = probe.out.match(/OK (\d+) (\S+)/)

  if (!parsed) {
    return [
      {
        name: 'Frigate /api/config',
        status: 'fail',
        detail: probe.out.slice(0, 160) || 'нет ответа',
        hint: probe.out.includes('401')
          ? 'проверь FRIGATE_AUTH_SECRET в .env'
          : 'проверь FRIGATE_REMOTE_URL и FRIGATE_AUTH_SECRET в .env',
      },
    ]
  }

  const count = Number(parsed[1])
  return [
    {
      name: 'Frigate /api/config',
      status: count > 0 ? 'ok' : 'warn',
      detail: `Frigate ${parsed[2]}, камер: ${count}`,
      ...(count > 0
        ? {}
        : { hint: 'в конфиге Frigate нет камер — бот не покажет список' }),
    },
  ]
}

/** The catalog key is what the bot ultimately reads. */
const checkCatalog = async (
  composeArgs: string[],
  service: string,
  source: string,
): Promise<Check> => {
  const { ok, out } = await inService(
    composeArgs,
    service,
    `redis-cli GET spotter.catalog.${source}`,
  )
  if (!ok || !out || out === '(nil)') {
    return {
      name: `Каталог камер (spotter.catalog.${source})`,
      status: 'fail',
      detail: 'пусто — бот скажет «Список камер пока недоступен»',
      hint: 'перезапусти адаптер: ./spotter update (или ./spotter restart)',
    }
  }
  const cameras = (out.match(/"code"/g) ?? []).length
  return {
    name: `Каталог камер (spotter.catalog.${source})`,
    status: cameras > 0 ? 'ok' : 'warn',
    detail: `записей: ${cameras}`,
  }
}

const checkTunnel = async (env: Record<string, string>): Promise<Check[]> => {
  const url = env.REDIS_REMOTE_URL
  if (!url) {
    return [
      {
        name: 'Канал до облака',
        status: 'fail',
        detail: 'REDIS_REMOTE_URL не задан',
        hint: 'sudo ./spotter tunnel',
      },
    ]
  }

  const active = await $`systemctl is-active spotter-tunnel`
    .quiet()
    .nothrow()
    .text()
    .catch(() => '')
  const service: Check = {
    name: 'Служба spotter-tunnel',
    status: active.trim() === 'active' ? 'ok' : 'warn',
    detail: active.trim() || 'не найдена',
    hint:
      active.trim() === 'active'
        ? undefined
        : 'настроена вручную? тогда это нормально',
  }

  const target = url.replace(/^redis:\/\//, '')
  const [host, port = '6379'] = target.split(':')
  let reachable = false
  try {
    const socket = await Bun.connect({
      hostname: host ?? '',
      port: Number(port),
      socket: { data() {} },
    })
    socket.end()
    reachable = true
  } catch {
    reachable = false
  }

  return [
    service,
    {
      name: 'Облачный Redis через туннель',
      status: reachable ? 'ok' : 'fail',
      detail: reachable ? `${target} доступен` : `${target} не отвечает`,
      hint: reachable ? undefined : 'systemctl status spotter-tunnel',
    },
  ]
}

const checkTelegram = async (env: Record<string, string>): Promise<Check> => {
  const token = env.TELEGRAM_TOKEN
  if (!token || token.includes('your_')) {
    return {
      name: 'Telegram API',
      status: 'fail',
      detail: 'TELEGRAM_TOKEN не заполнен',
      hint: 'возьми токен у @BotFather и впиши в .env',
    }
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json()) as {
      ok?: boolean
      description?: string
      result?: { username?: string }
    }
    return body.ok
      ? {
          name: 'Telegram API',
          status: 'ok',
          detail: `бот @${body.result?.username ?? '?'}`,
        }
      : {
          name: 'Telegram API',
          status: 'fail',
          detail: body.description ?? 'отказ',
          hint: 'проверь TELEGRAM_TOKEN',
        }
  } catch (error) {
    return {
      name: 'Telegram API',
      status: 'fail',
      detail: `недоступен: ${(error as Error).message}`,
      hint: 'проверь интернет и DNS на этом узле',
    }
  }
}

const checkS3 = async (env: Record<string, string>): Promise<Check> => {
  const host = env.S3_HOST
  if (!host || host.includes('example.com')) {
    return {
      name: 'S3',
      status: 'fail',
      detail: 'S3_HOST не заполнен',
      hint: 'без него не будет видео и кадров',
    }
  }
  try {
    await fetch(host, { signal: AbortSignal.timeout(10_000) })
    return { name: 'S3', status: 'ok', detail: `${host} отвечает` }
  } catch (error) {
    return {
      name: 'S3',
      status: 'fail',
      detail: `${host}: ${(error as Error).message}`,
      hint: 'проверь S3_HOST и доступность хранилища',
    }
  }
}

export const diagnose = async (
  mode: Mode,
  composeArgs: string[],
): Promise<Check[]> => {
  const env = readEnv()
  const source = env.SOURCE_ID || 'frigate'
  const redisService = mode === 'ingest' ? 'local-redis' : 'redis'

  // By the flag, not the name — someone else's broker is often `mosquitto` too.
  const ownBroker =
    env.MQTT_NETWORK_EXTERNAL !== 'true' &&
    (!env.MQTT_BROKER || /^mqtts?:\/\/mosquitto[:/]?/.test(env.MQTT_BROKER))

  // Opt-in frontends: expected only once .env says they were switched on.
  const frontends = ['pwa', 'email'].filter((name) =>
    (env.SPOTTER_PROFILES ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .includes(name),
  )

  const expected =
    mode === 'ingest'
      ? [
          'local-redis',
          ...(ownBroker ? ['mosquitto'] : []),
          'spotter-frigate',
          'spotter-forwarder',
        ]
      : mode === 'cloud'
        ? [
            'redis',
            'spotter-server',
            'spotter-telegram',
            ...frontends.map((name) => `spotter-${name}`),
          ]
        : [
            'redis',
            ...(ownBroker ? ['mosquitto'] : []),
            'spotter-frigate',
            'spotter-server',
            'spotter-telegram',
            ...frontends.map((name) => `spotter-${name}`),
          ]

  const checks: Check[] = [
    ...(await checkContainers(composeArgs, expected)),
    ...(await checkRedis(composeArgs, redisService)),
  ]

  if (mode === 'ingest' || mode === 'single') {
    // Broker first: it is the first hop of the event path, and a silent one.
    checks.push(
      ...(await checkMqtt(
        composeArgs,
        env.MQTT_BROKER || 'mqtt://mosquitto:1883',
        ownBroker,
      )),
    )
    checks.push(...(await checkFrigate(composeArgs)))
  }

  // The bot reads this key; on ingest it proves the adapter published at all.
  checks.push(await checkCatalog(composeArgs, redisService, source))
  checks.push(await checkS3(env))

  if (mode === 'ingest') checks.push(...(await checkTunnel(env)))
  if (mode === 'cloud' || mode === 'single')
    checks.push(await checkTelegram(env))

  return checks
}

const ICONS: Record<Status, string> = { ok: '✓', warn: '!', fail: '✗' }

export const report = (checks: Check[]): boolean => {
  console.log()
  for (const check of checks) {
    console.log(`  ${ICONS[check.status]} ${check.name}: ${check.detail}`)
    if (check.hint) console.log(`      → ${check.hint}`)
  }

  const failed = checks.filter((check) => check.status === 'fail')
  console.log()
  if (failed.length === 0) {
    console.log('  Всё в порядке.')
    return true
  }
  console.log(`  Проблем: ${failed.length}. Начни с первой сверху.`)
  return false
}
