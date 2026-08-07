#!/usr/bin/env bun

// First-run wizard: seeds .env from a template, asks only what is required,
// brings the stack up and prints an admin code. Idempotent — an existing .env
// is kept unless the user opts to overwrite.
//
//   bun .integration/install.ts
//   docker run --rm -it -v "$PWD":/w -w /w oven/bun bun .integration/install.ts

import { existsSync } from 'node:fs'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { $ } from 'bun'

type Mode = 'single' | 'cloud' | 'ingest'

const rl = createInterface({ input: process.stdin, output: process.stdout })

// Probing with the depot image itself: it is needed anyway, so nothing extra
// is pulled, and it tests the very container that will run in production.
const DEPOT_IMAGE = 'ghcr.io/mksavin/spotter-depot:latest'

const say = (msg = '') => console.log(msg)
const step = (n: number, msg: string) => say(`\n[${n}] ${msg}`)

const ask = async (question: string, fallback = ''): Promise<string> => {
  const suffix = fallback ? ` [${fallback}]` : ''
  const answer = (await rl.question(`  ${question}${suffix}: `)).trim()
  return answer || fallback
}

const askYesNo = async (question: string, def = false): Promise<boolean> => {
  const hint = def ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`  ${question} (${hint}): `))
    .trim()
    .toLowerCase()
  if (!answer) return def
  return answer === 'y' || answer === 'yes' || answer === 'д' || answer === 'да'
}

const toBase64Url = (bytes: ArrayBuffer): string =>
  Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

/** VAPID keypair in base64url. Not via the image: it ships no node_modules. */
const generateVapidKeys = async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  return {
    publicKey: toBase64Url(await crypto.subtle.exportKey('raw', publicKey)),
    privateKey: jwk.d ?? '',
  }
}

type GpuProbe = { usable: boolean; reason: string }

/**
 * Probes CUDA end to end: only a container that actually starts with a GPU
 * proves the driver, the toolkit and the kernel module all line up.
 */
const probeGpu = async (): Promise<GpuProbe> => {
  try {
    await $`nvidia-smi`.quiet()
  } catch {
    return { usable: false, reason: 'карта или драйвер NVIDIA не обнаружены' }
  }

  const runtimes = await $`docker info --format ${'{{json .Runtimes}}'}`
    .quiet()
    .text()
    .catch(() => '')
  if (!runtimes.includes('nvidia'))
    return { usable: false, reason: 'не установлен nvidia-container-toolkit' }

  try {
    await $`docker run --rm --gpus all ${DEPOT_IMAGE} true`.quiet()
    return { usable: true, reason: '' }
  } catch {
    // Typically a driver upgrade with the old module still loaded.
    return {
      usable: false,
      reason: 'контейнер с --gpus не стартует (нужна перезагрузка узла?)',
    }
  }
}

/** Replace `KEY=...` in place, keeping any trailing `# hint` on that line. */
const setEnv = (content: string, key: string, value: string): string => {
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (!pattern.test(content)) return `${content}\n${key}=${value}\n`
  return content.replace(pattern, (current) => {
    const hint = current.match(/\s+#.*$/)?.[0] ?? ''
    return `${key}=${value}${hint}`
  })
}

const fail = (msg: string): never => {
  say(`\n✗ ${msg}`)
  rl.close()
  process.exit(1)
}

// 1. Docker
step(1, 'Проверяю Docker…')
try {
  await $`docker --version`.quiet()
  await $`docker compose version`.quiet()
  say('  ✓ Docker и Docker Compose на месте')
} catch {
  fail(
    'Не найден Docker или Docker Compose. Установи Docker Desktop / docker + \n' +
      '    docker-compose-plugin и запусти заново.',
  )
}

// 2. Mode
step(2, 'Режим развёртывания')
say('  1) single — всё на одной машине (проще всего)')
say(
  '  2) cloud  — облачный узел распределёнки (server + telegram + опц. pwa/email)',
)
say('  3) ingest — узел рядом с камерами (frigate + depot + forwarder)')
const modeChoice = await ask('Выбор (1/2/3)', '1')
const mode: Mode =
  ({ '1': 'single', '2': 'cloud', '3': 'ingest' } as const)[modeChoice] ??
  'single'
const exampleByMode: Record<Mode, string> = {
  single: '.env.example',
  cloud: '.env.cloud.example',
  ingest: '.env.ingest.example',
}
const example = exampleByMode[mode]
say(`  → режим: ${mode} (шаблон ${example})`)

// 3. Seed .env (idempotent)
step(3, 'Готовлю .env')
if (existsSync('.env')) {
  const overwrite = await askYesNo(
    '.env уже существует. Перезаписать из шаблона? (n — оставить и выйти)',
    false,
  )
  if (!overwrite) {
    say('  ✓ Оставляю текущий .env без изменений.')
    say(`\nЗапусти стек вручную:  make ${mode}`)
    rl.close()
    process.exit(0)
  }
}
if (!existsSync(example))
  fail(`Не найден шаблон ${example} в корне репозитория.`)
let env = await Bun.file(example).text()
say(`  ✓ Скопировал ${example} → .env (пока в памяти)`)

// 4. Required values
step(4, 'Обязательные параметры')
say('  S3-хранилище (любой S3-совместимый бэкенд):')
env = setEnv(
  env,
  'S3_HOST',
  await ask(
    'S3_HOST',
    mode === 'single' ? 'http://localhost:9000' : 'https://s3.example.com',
  ),
)
env = setEnv(env, 'S3_ACCESS', await ask('S3_ACCESS'))
env = setEnv(env, 'S3_SECRET', await ask('S3_SECRET'))
env = setEnv(env, 'S3_BUCKET', await ask('S3_BUCKET', 'spotter'))

if (mode === 'single' || mode === 'cloud') {
  env = setEnv(
    env,
    'TELEGRAM_TOKEN',
    await ask('TELEGRAM_TOKEN (от @BotFather)'),
  )
}

if (mode === 'ingest') {
  say('  Доступ к Frigate/NVR (живёт только на этом узле):')
  env = setEnv(
    env,
    'FRIGATE_REMOTE_URL',
    await ask('FRIGATE_REMOTE_URL', 'https://frigate.example.local'),
  )
  env = setEnv(
    env,
    'FRIGATE_AUTH_USER',
    await ask('FRIGATE_AUTH_USER', 'admin'),
  )
  env = setEnv(env, 'FRIGATE_AUTH_SECRET', await ask('FRIGATE_AUTH_SECRET'))
  say('  Облачный Redis внутри VPN-туннеля:')
  env = setEnv(
    env,
    'REDIS_REMOTE_URL',
    await ask('REDIS_REMOTE_URL', 'redis://10.0.0.1:6379'),
  )
}

// 5. Transcoding acceleration (ingest runs the depot replicas)
let useGpu = false
if (mode === 'ingest') {
  step(5, 'Ускорение перекодирования')
  say('  Проверяю GPU (это занимает несколько секунд)…')
  const gpu = await probeGpu()
  if (gpu.usable) {
    useGpu = true
    env = setEnv(env, 'VIDEO_ACCELERATION', 'cuda')
    say('  ✓ NVIDIA работает — включаю cuda (в разы быстрее CPU)')
  } else {
    env = setEnv(env, 'VIDEO_ACCELERATION', 'cpu')
    say(`  → GPU недоступен: ${gpu.reason}`)
    say('    Ставлю cpu — медленнее, но работает везде.')
    say('    Починив GPU, поставь VIDEO_ACCELERATION=cuda и подними с GPU=1.')
  }
}

// 6. PWA / VAPID (opt-in)
if (mode === 'single' || mode === 'cloud') {
  step(6, 'PWA-фронтенд (опционально)')
  const wantPwa = await askYesNo(
    'Включить PWA (Web Push)? Сгенерирую VAPID-пару',
    false,
  )
  if (wantPwa) {
    env = setEnv(
      env,
      'PUBLIC_URL',
      await ask('PUBLIC_URL (за TLS-прокси)', 'https://spotter.example.com'),
    )
    say('  Генерирую VAPID-ключи…')
    try {
      const { publicKey, privateKey } = await generateVapidKeys()
      env = setEnv(env, 'VAPID_PUBLIC_KEY', publicKey)
      env = setEnv(env, 'VAPID_PRIVATE_KEY', privateKey)
      say('  ✓ VAPID-пара записана в .env')
    } catch {
      say('  ! Не удалось сгенерировать VAPID-пару.')
      say('    Заполни VAPID_* вручную позже — см. .env.')
    }
    say('  Не забудь раскомментировать сервис spotter-pwa в профиле cloud.')
  }
}

// 7. Write .env
step(7, 'Записываю .env')
await Bun.write('.env', env)
say(
  '  ✓ .env готов. Проверь остальные значения при желании — там рабочие дефолты.',
)

// 8. Bring the stack up
step(8, 'Поднимаю стек')
// GPU=1 pulls in the overlay that reserves the card for the depot replicas.
const upCommand = useGpu ? `make ${mode} GPU=1` : `make ${mode}`
const bringUp = await askYesNo(`Запустить сейчас (${upCommand})?`, true)
if (!bringUp) {
  say(`\nГотово. Когда будешь готов:  ${upCommand}`)
  rl.close()
  process.exit(0)
}
try {
  if (useGpu) await $`make ${mode} GPU=1`
  else await $`make ${mode}`
} catch {
  fail(`${upCommand} завершился с ошибкой — смотри вывод выше.`)
}

// 9. Access code (single/cloud only)
if (mode === 'single' || mode === 'cloud') {
  step(9, 'Код доступа администратора')
  say('  Жду, пока server применит миграции…')
  await Bun.sleep(4000)
  try {
    const token =
      await $`docker exec spotter-server bun spotter sign admin`.text()
    say('\n──────────────────────────────────────────────')
    say(token.trim())
    say('──────────────────────────────────────────────')
    say('  Отправь боту:  /login <код>')
  } catch {
    say('  ! Не удалось выпустить код автоматически. Позже:  make token')
  }
}

say('\n✓ Готово.')
rl.close()
process.exit(0)
