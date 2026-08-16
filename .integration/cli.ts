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
  '--pwa',
  '--email',
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

// The NVIDIA overlay is ingest-only and on by default — GPU transcoding is
// several times faster, so opting out is the deliberate choice.
const composeArgs = (mode: Mode): string[] => {
  const files = [path.join('.deployment', 'compose', `production.${mode}.yml`)]
  if (mode === 'ingest' && !has('--no-gpu'))
    files.push(path.join('.deployment', 'compose', 'production.ingest.gpu.yml'))
  // Optional frontends live behind compose profiles.
  const profiles = (['pwa', 'email'] as const).filter((name) =>
    has(`--${name}`),
  )
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
  const { exitCode } = await $`docker ${composeArgs(mode)} ${args}`
    .cwd(root)
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
      const passthrough = has('--no-tunnel') ? [...rest, '--no-tunnel'] : rest
      const { exitCode } = await $`bun .integration/install.ts ${passthrough}`
        .cwd(root)
        .nothrow()
      process.exit(exitCode)
    },
  },

  up: {
    about: 'Поднять узел',
    run: async () => {
      await prepareData()
      await compose(['up', '-d', ...upFlags()])
    },
  },

  down: { about: 'Остановить узел', run: () => compose(['down']) },

  ps: { about: 'Статус контейнеров', run: () => compose(['ps']) },

  logs: {
    usage: '[сервис] [-f]',
    about: 'Логи целиком; -f — следить дальше',
    run: (rest) => {
      // Print and exit by default; docker's own flags (-f, --tail, --since) pass
      // through, so `logs server -f` follows and `logs server --tail=50` trims.
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
    run: (rest) => compose(['restart', ...rest.map(serviceName)]),
  },

  recreate: {
    about: 'Пересоздать (после правки портов в .env)',
    run: async () => {
      await prepareData()
      await compose(['up', '-d', '--force-recreate', ...upFlags()])
    },
  },

  update: {
    about: 'Скачать свежие образы и пересоздать',
    run: async () => {
      const mode = requireMode()
      await prepareData()
      await $`docker ${composeArgs(mode)} pull`.cwd(root)
      await $`docker ${composeArgs(mode)} up -d ${upFlags()}`.cwd(root)
      await $`docker image prune -f`.cwd(root)
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
      // Only this container is recreated: the interval is a container argument,
      // fixed at creation, and the apps have no reason to restart with it.
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
      const url = await configure({
        say: (msg = '') => console.log(msg),
        ask: async (question, fallback = '') => {
          const suffix = fallback ? ` [${fallback}]` : ''
          const answer = (await rl.question(`  ${question}${suffix}: `)).trim()
          return answer || fallback
        },
      })
      rl.close()
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
    --no-gpu                 Без NVIDIA (ingest; по умолчанию GPU включён)
    --no-watchtower          Без авто-обновления
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

await command.run(rest)
