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

const readMode = (): Mode | undefined => {
  if (!existsSync(envFile)) return undefined
  const found = readFileSync(envFile, 'utf8').match(/^SPOTTER_MODE=(.*)$/m)?.[1]
  const stored = found?.trim()
  return stored && isMode(stored) ? stored : undefined
}

const requireMode = (): Mode => {
  const mode = readMode()
  if (mode) return mode
  console.error(
    'spotter: в .env нет SPOTTER_MODE — запусти `spotter install <single|cloud|ingest>`',
  )
  process.exit(2)
}

// Our own flags are stripped; whatever is left goes to docker compose.
const OWN_FLAGS = [
  '--no-gpu',
  '--no-watchtower',
  '--no-tunnel',
  '--pwa',
  '--email',
  '--watchtower-interval',
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

const compose = async (args: string[]): Promise<never> => {
  const mode = requireMode()
  const interval = flags.get('--watchtower-interval')
  // Spread, not a bare object: .env({}) would wipe PATH and HOME for docker.
  const env = { ...process.env }
  if (interval) env.WATCHTOWER_INTERVAL = interval
  const { exitCode } = await $`docker ${composeArgs(mode)} ${args}`
    .cwd(root)
    .env(env)
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

const help = (): void => {
  const mode = readMode()
  console.log(`
  spotter — управление узлом${mode ? ` (режим: ${mode})` : ''}

  spotter install [single|cloud|ingest]   Мастер первичной настройки
                  [--no-tunnel]           …без SSH-туннеля (ingest)
  spotter up                             Поднять узел
  spotter down                           Остановить узел
  spotter ps                             Статус контейнеров
  spotter logs [сервис] [-f]             Логи целиком; -f — следить дальше
  spotter restart [сервис]               Перезапустить (образ тот же)
  spotter recreate                       Пересоздать (после правки портов в .env)
  spotter update                         Скачать свежие образы и пересоздать
  spotter exec <сервис> <команда>        Команда внутри контейнера
  spotter doctor                         Самодиагностика узла
  spotter tunnel                         Настроить канал до cloud (ingest, sudo)
  spotter token [роль] [опции]           Код доступа: viewer|user|admin (умолч. admin)
  spotter compose <аргументы>            Любая docker compose команда

  Флаги:
    --pwa                    Поднять PWA-фронтенд (нужны VAPID_* в .env)
    --email                  Поднять email-фронтенд (нужны SMTP_* в .env)
    --no-gpu                 Без NVIDIA (ingest; по умолчанию GPU включён)
    --no-watchtower          Без авто-обновления
    --watchtower-interval=N  Интервал авто-обновления в секундах
`)
}

const upFlags = (): string[] =>
  has('--no-watchtower') ? ['--scale', 'watchtower=0'] : []

const [command, ...argv] = process.argv.slice(2)
const rest = takeFlags(argv)

switch (command) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    help()
    break

  case 'install': {
    const [requested] = rest
    if (requested && !isMode(requested)) {
      console.error(`spotter: unknown mode ${requested}`)
      process.exit(2)
    }
    const passthrough = has('--no-tunnel') ? [...rest, '--no-tunnel'] : rest
    const { exitCode } = await $`bun .integration/install.ts ${passthrough}`
      .cwd(root)
      .nothrow()
    process.exit(exitCode)
    break
  }

  case 'up':
    await prepareData()
    await compose(['up', '-d', ...upFlags()])
    break

  case 'restart':
    await compose(['restart', ...rest.map(serviceName)])
    break

  case 'recreate':
    await prepareData()
    await compose(['up', '-d', '--force-recreate', ...upFlags()])
    break

  case 'update': {
    const mode = requireMode()
    await prepareData()
    await $`docker ${composeArgs(mode)} pull`.cwd(root)
    await $`docker ${composeArgs(mode)} up -d ${upFlags()}`.cwd(root)
    await $`docker image prune -f`.cwd(root)
    break
  }

  case 'down':
    await compose(['down'])
    break

  case 'ps':
    await compose(['ps'])
    break

  case 'logs': {
    // Print and exit by default; docker's own flags (-f, --tail, --since) pass
    // through, so `logs server -f` follows and `logs server --tail=50` trims.
    const [first, ...extra] = rest
    const service = first && !first.startsWith('-') ? first : undefined
    const passthrough = service ? extra : rest
    await compose([
      'logs',
      ...(passthrough.some((arg) => arg.startsWith('--tail'))
        ? []
        : ['--tail', 'all']),
      ...passthrough,
      ...(service ? [serviceName(service)] : []),
    ])
    break
  }

  case 'exec': {
    const [service, ...command] = rest
    if (!service || command.length === 0) {
      console.error('spotter: нужно `spotter exec <сервис> <команда>`')
      process.exit(2)
    }
    await compose(['exec', serviceName(service), ...command])
    break
  }

  case 'doctor': {
    const mode = requireMode()
    console.log(`\n  Проверяю узел (режим: ${mode})…`)
    const { diagnose, report } = await import('./doctor')
    process.exit(report(await diagnose(mode, composeArgs(mode))) ? 0 : 1)
    break
  }

  case 'tunnel': {
    if (requireMode() !== 'ingest') {
      console.error('spotter: туннель настраивается только на ingest-узле')
      process.exit(2)
    }
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
    // Rewrite in place so the surrounding .env keeps its comments.
    const current = readFileSync(envFile, 'utf8')
    const line = `REDIS_REMOTE_URL=${url}`
    writeFileSync(
      envFile,
      /^REDIS_REMOTE_URL=.*$/m.test(current)
        ? current.replace(/^REDIS_REMOTE_URL=.*$/m, line)
        : `${current}\n${line}\n`,
    )
    console.log('\n  ✓ REDIS_REMOTE_URL записан в .env')
    console.log('  Осталось перезапустить: ./spotter recreate')
    break
  }

  case 'token': {
    const ROLES = ['viewer', 'user', 'admin']
    // A leading non-flag word is the role; options may come without one.
    const named = rest[0] && !rest[0].startsWith('-')
    const role = named ? (rest[0] as string) : 'admin'
    const extra = named ? rest.slice(1) : rest
    if (!ROLES.includes(role)) {
      console.error(`spotter: роль "${role}" — доступны: ${ROLES.join(' | ')}`)
      process.exit(2)
    }
    // Remaining arguments go to the server CLI (-u, -b, -r).
    await $`docker exec spotter-server bun spotter sign ${role} ${extra}`.cwd(
      root,
    )
    break
  }

  case 'compose':
    await compose(rest)
    break

  default:
    console.error(`spotter: unknown command ${command}`)
    help()
    process.exit(2)
}
