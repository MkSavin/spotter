#!/usr/bin/env bun

// Node control CLI. Wraps the long `docker compose` invocation and reads the
// node mode from .env, so day-to-day commands carry no flags.
//
//   spotter up | down | ps | logs [service] | token | tunnel
//   spotter compose <any docker compose arguments>
//   spotter install [single|cloud|ingest]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { $ } from 'bun'
import { configure } from './tunnel'

const MODES = ['single', 'cloud', 'ingest'] as const
type Mode = (typeof MODES)[number]

const root = path.join(import.meta.dir, '..')
const envFile = path.join(root, '.env')

const isMode = (value: string): value is Mode =>
  (MODES as readonly string[]).includes(value)

/** Aborts with a usage error; `never` lets callers use it as a guard. */
const fail = (message: string): never => {
  console.error(`spotter: ${message}`)
  process.exit(2)
}

const readEnv = (key: string): string | undefined => {
  if (!existsSync(envFile)) return undefined
  const found = readFileSync(envFile, 'utf8').match(
    new RegExp(`^${key}=(.*)$`, 'm'),
  )?.[1]
  return found?.trim() || undefined
}

const readMode = (): Mode | undefined => {
  const stored = readEnv('SPOTTER_MODE')
  return stored && isMode(stored) ? stored : undefined
}

const requireMode = (): Mode =>
  readMode() ??
  fail(
    'в .env нет SPOTTER_MODE — запусти `spotter install <single|cloud|ingest>`',
  )

// Our own flags are stripped; whatever is left goes to docker compose.
const OWN_FLAGS = [
  '--no-gpu',
  '--no-watchtower',
  '--no-tunnel',
  '--own-mqtt',
  '--external-mqtt',
  '--pwa',
  '--email',
  '--probe',
]

const flags = new Map<string, string>()
const takeFlags = (args: string[]): string[] =>
  args.filter((arg) => {
    const [name, value] = arg.split('=', 2)
    if (!OWN_FLAGS.includes(name)) return true
    flags.set(name, value ?? '')
    return false
  })

const has = (flag: string): boolean => flags.has(flag)

/** Whether to start our broker. By the flag, not the name — theirs is often `mosquitto` too. */
const ownsBroker = (): boolean => {
  const broker = readEnv('MQTT_BROKER') ?? ''
  if (readEnv('MQTT_NETWORK_EXTERNAL') === 'true') return false
  return !broker || /^mqtts?:\/\/mosquitto[:/]?/.test(broker)
}

const FRONTENDS = ['pwa', 'email'] as const

/**
 * Optional frontends to run. A flag turns one on for this command; without any
 * flag the choice comes from SPOTTER_PROFILES, so `update` and `up` keep what
 * install set up instead of silently dropping it.
 */
const frontendProfiles = (): string[] => {
  const stored = (readEnv('SPOTTER_PROFILES') ?? '')
    .split(',')
    .map((name) => name.trim())
  const asked = FRONTENDS.filter((name) => has(`--${name}`))
  if (asked.length === 0)
    return FRONTENDS.filter((name) => stored.includes(name))
  // Remember the choice, so the next update does not quietly drop the frontend.
  if (asked.some((name) => !stored.includes(name)))
    persistEnv('SPOTTER_PROFILES', asked.join(','))
  return asked
}

/**
 * Whether to run the stub detector, for this command only.
 *
 * Deliberately not persisted, unlike the frontends: forgetting a frontend is
 * an annoyance, while a probe that quietly survives into the next `update`
 * leaves the property unwatched. Asking for it every time is the point.
 */
const probeProfile = (): string[] => (has('--probe') ? ['probe'] : [])

// GPU is on by default: transcoding is several times faster.
const composeArgs = (mode: Mode): string[] => {
  const files = [path.join('.deployment', 'compose', `production.${mode}.yml`)]
  if (mode === 'ingest' && !has('--no-gpu'))
    files.push(path.join('.deployment', 'compose', 'production.ingest.gpu.yml'))
  // Both delivery nodes can host the frontends; ingest has no Redis of its own.
  if (mode !== 'ingest')
    files.push(path.join('.deployment', 'compose', 'production.frontends.yml'))
  // Beside the adapter and the NVR, which is both of these nodes.
  if (mode !== 'cloud')
    files.push(path.join('.deployment', 'compose', 'production.probe.yml'))
  const profiles = [...frontendProfiles(), ...probeProfile()]
  // From .env, not a flag: chosen once at install, not repeated every `up`.
  if (ownsBroker()) profiles.push('mqtt')
  return [
    'compose',
    '--project-directory',
    '.',
    ...files.flatMap((file) => ['-f', file]),
    ...profiles.flatMap((name) => ['--profile', name]),
  ]
}

/** Rewrites `KEY=value` in .env, keeping the rest of the file untouched. */
const persistEnv = (key: string, value: string): void => {
  const current = readFileSync(envFile, 'utf8')
  const line = `${key}=${value}`
  writeFileSync(
    envFile,
    new RegExp(`^${key}=.*$`, 'm').test(current)
      ? current.replace(new RegExp(`^${key}=.*$`, 'm'), line)
      : `${current}\n${line}\n`,
  )
}

const compose = async (args: string[]): Promise<never> => {
  const mode = requireMode()

  if (has('--probe')) {
    console.warn(
      '\n⚠️  ФИКТИВНЫЙ ДЕТЕКТОР ВКЛЮЧЁН.\n' +
        '   Реальная детекция не работает — за участком никто не следит.\n' +
        '   Сними профиль сразу после проверки: ./spotter up\n',
    )
  }

  const { exitCode } = await $`docker ${composeArgs(mode)} ${args}`
    .cwd(root)
    // Passed here rather than written to .env: the adapter must forget the
    // probe the moment the profile is dropped.
    .env({
      ...process.env,
      ...(has('--probe')
        ? { PROBE_ENDPOINT: 'http://spotter-probe:8080' }
        : {}),
    })
    .nothrow()
  process.exit(exitCode)
}

// Docker creates these as root, but the apps write SQLite as uid 1000.
const DATA_DIRS = ['server', 'telegram', 'pwa', 'email']

const prepareData = async (): Promise<void> => {
  for (const dir of DATA_DIRS) {
    const full = path.join(root, '.docker', dir)
    if (!existsSync(full)) mkdirSync(full, { recursive: true })
  }
  await $`chown -R 1000:1000 ${DATA_DIRS.map((d) => path.join('.docker', d))}`
    .cwd(root)
    .quiet()
    .nothrow()
}

// Infra services keep their compose name; app shorthands gain the prefix.
const INFRA = ['redis', 'local-redis', 'mosquitto', 'watchtower']

const serviceName = (name: string): string =>
  INFRA.includes(name) || name.startsWith('spotter-') ? name : `spotter-${name}`

/** Prefixes service names but leaves docker's own flags untouched. */
const services = (args: string[]): string[] =>
  args.map((arg) => (arg.startsWith('-') ? arg : serviceName(arg)))

const upFlags = (): string[] =>
  has('--no-watchtower') ? ['--scale', 'watchtower=0'] : []

type Command = {
  /** Argument spec shown after the name in help, e.g. `[сервис] [-f]`. */
  readonly usage?: string
  readonly about: string
  readonly run: (args: string[]) => unknown
}

// Single source of truth: help text, typo suggestions and dispatch all read it.
const COMMANDS: Record<string, Command> = {
  install: {
    usage: '[single|cloud|ingest]',
    about: 'Мастер первичной настройки (--no-tunnel — без SSH-туннеля)',
    run: async (rest) => {
      const [requested] = rest
      if (requested && !isMode(requested))
        fail(
          `неизвестный режим «${requested}» — доступны: ${MODES.join(' | ')}`,
        )
      // takeFlags() stripped these; the installer wants them back.
      const forwarded = ['--no-tunnel', '--own-mqtt', '--external-mqtt'].filter(
        has,
      )
      const passthrough = [...rest, ...forwarded]
      const { exitCode } = await $`bun .integration/install.ts ${passthrough}`
        .cwd(root)
        .nothrow()
      process.exit(exitCode)
    },
  },

  up: {
    usage: '[сервис]',
    about: 'Поднять узел целиком; с именем — только этот сервис',
    run: async (rest) => {
      await prepareData()
      await compose(['up', '-d', ...upFlags(), ...services(rest)])
    },
  },

  down: {
    usage: '[сервис]',
    about: 'Остановить узел целиком; с именем — только этот сервис',
    // `down <service>` removes the container; stopping one is `stop`.
    run: (rest) =>
      rest.length > 0
        ? compose(['stop', ...services(rest)])
        : compose(['down']),
  },

  ps: {
    usage: '[сервис]',
    about: 'Статус контейнеров',
    run: (rest) => compose(['ps', ...services(rest)]),
  },

  logs: {
    usage: '[сервис] [-f]',
    about: 'Логи целиком; -f — следить дальше',
    run: (rest) => {
      // Print and exit by default; docker's own flags pass through.
      const [first, ...extra] = rest
      const service = first && !first.startsWith('-') ? first : undefined
      const passthrough = service ? extra : rest
      return compose([
        'logs',
        ...(passthrough.some((arg) => arg.startsWith('--tail'))
          ? []
          : ['--tail', 'all']),
        ...passthrough,
        ...(service ? [serviceName(service)] : []),
      ])
    },
  },

  restart: {
    usage: '[сервис]',
    about: 'Перезапустить (образ тот же)',
    run: (rest) => compose(['restart', ...services(rest)]),
  },

  recreate: {
    usage: '[сервис]',
    about: 'Пересоздать (после правки портов в .env)',
    run: async (rest) => {
      await prepareData()
      await compose([
        'up',
        '-d',
        '--force-recreate',
        ...upFlags(),
        ...services(rest),
      ])
    },
  },

  update: {
    usage: '[сервис]',
    about: 'Скачать свежие образы и пересоздать',
    run: async (rest) => {
      const mode = requireMode()
      const targets = services(rest)
      await prepareData()
      await $`docker ${composeArgs(mode)} pull ${targets}`.cwd(root)
      await $`docker ${composeArgs(mode)} up -d ${upFlags()} ${targets}`.cwd(
        root,
      )
      // Pruning after a partial update would drop images still in use.
      if (targets.length === 0) await $`docker image prune -f`.cwd(root)
    },
  },

  exec: {
    usage: '<сервис> <команда>',
    about: 'Команда внутри контейнера',
    run: (rest) => {
      const [service, ...command] = rest
      if (!service || command.length === 0)
        fail('нужно `spotter exec <сервис> <команда>`')
      return compose(['exec', serviceName(service), ...command])
    },
  },

  doctor: {
    about: 'Самодиагностика узла',
    run: async () => {
      const mode = requireMode()
      console.log(`\n  Проверяю узел (режим: ${mode})…`)
      const { diagnose, report } = await import('./doctor')
      process.exit(report(await diagnose(mode, composeArgs(mode))) ? 0 : 1)
    },
  },

  watchtower: {
    usage: '[секунды]',
    about: 'Интервал авто-обновления (без аргумента — показать)',
    run: async (rest) => {
      const mode = requireMode()
      const [value] = rest
      if (!value) {
        console.log(
          `\n  Интервал: ${readEnv('WATCHTOWER_INTERVAL') ?? '86400'} сек`,
        )
        console.log('  Поменять: ./spotter watchtower <секунды>\n')
        return
      }
      if (!/^\d+$/.test(value))
        fail('интервал — целое число секунд, например 3600')
      persistEnv('WATCHTOWER_INTERVAL', value)
      // Only this container: the interval is fixed at creation time.
      const { exitCode } =
        await $`docker ${composeArgs(mode)} up -d --force-recreate watchtower`
          .cwd(root)
          .nothrow()
      if (exitCode === 0)
        console.log(`\n  ✓ Проверка обновлений раз в ${value} сек`)
      process.exit(exitCode)
    },
  },

  tunnel: {
    about: 'Настроить канал до cloud (ingest, sudo)',
    run: async () => {
      if (requireMode() !== 'ingest')
        fail('туннель настраивается только на ingest-узле')
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      // An open readline keeps stdin alive and hangs the process.
      const url = await configure({
        say: (msg = '') => console.log(msg),
        ask: async (question, fallback = '') => {
          const suffix = fallback ? ` [${fallback}]` : ''
          const answer = (await rl.question(`  ${question}${suffix}: `)).trim()
          return answer || fallback
        },
      }).finally(() => rl.close())
      if (!url) process.exit(1)
      persistEnv('REDIS_REMOTE_URL', url)
      console.log('\n  ✓ REDIS_REMOTE_URL записан в .env')
      console.log('  Осталось перезапустить: ./spotter recreate')
    },
  },

  token: {
    usage: '[роль] [опции]',
    about: 'Код доступа: viewer|user|admin (умолч. admin)',
    run: (rest) => {
      const ROLES = ['viewer', 'user', 'admin']
      // A leading non-flag word is the role; options may come without one.
      const named = rest[0] && !rest[0].startsWith('-')
      const role = named ? (rest[0] as string) : 'admin'
      const extra = named ? rest.slice(1) : rest
      if (!ROLES.includes(role))
        fail(`роль «${role}» — доступны: ${ROLES.join(' | ')}`)
      // Remaining arguments go to the server CLI (-u, -b, -r).
      return $`docker exec spotter-server bun spotter sign ${role} ${extra}`.cwd(
        root,
      )
    },
  },

  compose: {
    usage: '<аргументы>',
    about: 'Любая docker compose команда',
    run: (rest) => compose(rest),
  },

  help: { about: 'Эта справка', run: () => help() },
}

const NAMES = Object.keys(COMMANDS)

const help = (): void => {
  const mode = readMode()
  const left = (name: string): string =>
    `spotter ${name}${COMMANDS[name]?.usage ? ` ${COMMANDS[name]?.usage}` : ''}`
  // Descriptions line up whatever the names are, so renaming cannot skew them.
  const width = Math.max(...NAMES.map((name) => left(name).length))
  console.log(`
  spotter — управление узлом${mode ? ` (режим: ${mode})` : ''}

${NAMES.map((name) => `  ${left(name).padEnd(width)}  ${COMMANDS[name]?.about}`).join('\n')}

  Флаги:
    --pwa                    Поднять PWA-фронтенд (нужны VAPID_* в .env)
    --email                  Поднять email-фронтенд (нужны SMTP_* в .env)
    --probe                  ⚠️  Поднять фиктивный детектор: РЕАЛЬНАЯ ДЕТЕКЦИЯ
                             ВЫКЛЮЧАЕТСЯ, за участком никто не следит. Только
                             на время проверки; не запоминается между запусками
    --no-gpu                 Без NVIDIA (ingest; по умолчанию GPU включён)
    --no-watchtower          Без авто-обновления
    --own-mqtt               install: поставить свой MQTT-брокер, не спрашивая
    --external-mqtt          install: использовать готовый брокер
`)
}

// Levenshtein, so a typo suggests the command instead of dumping the help.
const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        (row[j] ?? 0) + 1,
        (next[j - 1] ?? 0) + 1,
        (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    row = next
  }
  return row[b.length] ?? 0
}

// Under a third of the word may differ: a typo still matches, a wrong word does not.
const closest = (input: string): string | undefined =>
  NAMES.map((name) => ({ name, score: distance(input, name) }))
    .filter(
      ({ score, name }) => score <= Math.max(input.length, name.length) / 3,
    )
    .sort((a, b) => a.score - b.score)[0]?.name

const [name = 'help', ...argv] = process.argv.slice(2)
const rest = takeFlags(argv)

const command = COMMANDS[name === '--help' || name === '-h' ? 'help' : name]

if (!command) {
  const guess = closest(name)
  console.error(`\n  spotter: неизвестная команда «${name}»`)
  if (guess) console.error(`  Возможно, вы имели в виду: ./spotter ${guess}`)
  console.error('  Список команд: ./spotter help\n')
  process.exit(2)
}

// No `usage` = takes nothing. Dropping args silently is how `down frigate` killed the node.
if (!command.usage && rest.length > 0) {
  fail(`«${name}» не принимает аргументов — лишнее: ${rest.join(' ')}`)
}

try {
  await command.run(rest)
} catch (error) {
  // Otherwise a throw ends the process with no output at all.
  console.error(`\n  spotter: ${name} не выполнена`)
  console.error(`  ${(error as Error).message ?? error}\n`)
  process.exit(1)
}
